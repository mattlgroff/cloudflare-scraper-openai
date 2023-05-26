import { Pool } from 'pg';
import { Redis } from "@upstash/redis/cloudflare";

interface User {
  id: string;
  email: string;
  name: string;
}

interface ScrapingJob {
  id: string;
  user_id: string;
  href: string;
  selector: string;
  description: string;
  cron_schedule: string;
  latest_content: any; // we may want to define a specific type for this
}

interface Context {
  token: string;
}

interface Env {
  DATABASE_URL: string;
  REDIS_URL: string;
}

const getResolvers = (env: any): any => {
  const pool = new Pool({
    connectionString: `${env.DATABASE_URL}?sslmode=require`,
    ssl: {
      rejectUnauthorized: true, // Only allow SSL with certificates from trusted Certificate Authorities
    },
  });

  const redis = Redis.fromEnv(env);

  const resolvers = {
    Query: {
      users: async () => {
        try {
          const cache = await redis.get('users');
          console.log('cache for users', cache)
          if (cache) return cache;

          const { rows } = await pool.query('SELECT * FROM users');
          console.log('rows for users', rows)
          await redis.set('users', JSON.stringify(rows), {ex: 60});
          return rows;
        } catch (err) {
          console.error(err);
        }
      },
      scrapingJobs: async (_: any, { user_id }: { user_id: string }) => {
        try {
          const cache = await redis.get(`scrapingJobs:${user_id}`);
          console.log('cache for users', cache)
          if (cache) return cache;

          const { rows } = await pool.query('SELECT * FROM scraping_jobs WHERE user_id = $1', [user_id]);
          await redis.set(`scrapingJobs:${user_id}`, JSON.stringify(rows), {ex: 60});
          return rows;
        } catch (err) {
          console.error(err);
        }
      },
      scrapingJob: async (_: any, { id }: { id: string }) => {
        try {
          const cache = await redis.get(`scrapingJob:${id}`);
          if (cache) return cache;

          const { rows } = await pool.query('SELECT * FROM scraping_jobs WHERE id = $1', [id]);
          await redis.set(`scrapingJob:${id}`, JSON.stringify(rows[0]), {ex: 60});
          return rows[0];
        } catch (err) {
          console.error(err);
        }
      },
    },
    ScrapingJob: {
      latest_content: async (job: ScrapingJob) => {
        let latest_content;
        const redis_content = await redis.get(job.id);
        if (redis_content) {
          try {
            latest_content = JSON.parse(redis_content);
            return latest_content;
          } catch (error) {
            console.log('Failed to parse redis_content for job: ', job.id);
          }
        }
        if (!latest_content) {
          const { rows: histories } = await pool.query(
            'SELECT * FROM scraping_job_histories WHERE scraping_job_id = $1 ORDER BY created_at DESC LIMIT 1',
            [job.id]
          );
          try {
            latest_content = JSON.parse(histories[0]?.content || '');
            return latest_content;
          } catch (error) {
            console.log('Failed to parse content from Postgres for job: ', job.id);
          }
        }

        if (!latest_content) {
          throw new Error('Failed to get latest content for job: ' + job.id);
        }
      },
    },
  };

  return resolvers;
};

export default getResolvers;
