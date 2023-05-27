import { Pool } from 'pg';
import { Redis } from '@upstash/redis/cloudflare';

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
  latest_content: any; // JSON, stringified
}

interface ScrapingJobHistory {
  id: string;
  scraping_job_id: string;
  started_at: string;
  ended_at: string;
  successful: boolean;
  content: any; // JSON, stringified
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
          const { rows } = await pool.query('SELECT * FROM users');
          return rows;
        } catch (err) {
          console.error(err);
        }
      },
      scrapingJob: async (_: any, { id }: { id: string }) => {
        try {
          const { rows } = await pool.query('SELECT * FROM scraping_jobs WHERE id = $1', [id]);
          console.log('rows', rows);
          return rows[0];
        } catch (err) {
          console.error(err);
        }
      },
      allScrapingJobsCronSchedules: async () => {
        const { rows } = await pool.query('SELECT id, cron_schedule FROM scraping_jobs');
        return rows;
      },
    },
    User: {
      scrapingJobs: async (user: User) => {
        try {
          const { rows } = await pool.query('SELECT * FROM scraping_jobs WHERE user_id = $1', [user.id]);
          return rows;
        } catch (err) {
          console.error(err);
        }
      },
    },
    ScrapingJob: {
      latest_content: async (job: ScrapingJob) => {
        try {
          const { rows: histories } = await pool.query(
            'SELECT * FROM scraping_job_histories WHERE scraping_job_id = $1 ORDER BY created_at DESC LIMIT 1',
            [job.id]
          );

          return JSON.parse(histories[0]?.content || null);
        } catch (error) {
          console.log('Failed to parse content from Postgres for job: ', job.id);
        }
      },
    },
    Mutation: {
      createScrapingJob: async (_: any, { input }: { input: ScrapingJob }) => {
        const { user_id, href, selector, description, cron_schedule } = input;
        const timestamp = new Date().toISOString(); // current timestamp in ISO format
        const result = await pool.query(
          `
        INSERT INTO scraping_jobs(user_id, href, selector, description, cron_schedule, created_at, updated_at) 
        VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [user_id, href, selector, description, cron_schedule, timestamp, timestamp]
        );

        // set cache for this scraping job
        await redis.set(`scrapingJob:${result.rows[0].id}`, JSON.stringify(result.rows[0]));

        return result.rows[0];
      },
      updateScrapingJob: async (_: any, { id, input }: { id: string; input: ScrapingJob }) => {
        const { user_id, href, selector, description, cron_schedule } = input;
        const timestamp = new Date().toISOString(); // current timestamp in ISO format
        const result = await pool.query(
          `
          UPDATE scraping_jobs 
          SET user_id=$1, href=$2, selector=$3, description=$4, cron_schedule=$5, updated_at=$6 
          WHERE id=$7 RETURNING *`,
          [user_id, href, selector, description, cron_schedule, timestamp, id]
        );

        // delete cache for scrapingJobs by User
        await redis.del(`scrapingJobs:${user_id}`);

        // update cache for this scrapingJob
        await redis.set(`scrapingJob:${id}`, JSON.stringify(result.rows[0]));

        return result.rows[0];
      },
      deleteScrapingJob: async (_: any, { id }: { id: string }) => {
        // first get the job to obtain the user_id
        const jobResult = await pool.query('SELECT * FROM scraping_jobs WHERE id = $1', [id]);

        // if no scrapingJob is found, return false
        if (jobResult.rowCount === 0) {
          return false;
        }

        const user_id = jobResult.rows[0].user_id;

        // then delete from Postgres
        await pool.query('DELETE FROM scraping_jobs WHERE id = $1', [id]);

        // delete cache for scrapingJobs by User
        await redis.del(`scrapingJobs:${user_id}`);

        // delete scrapingJob from cache
        await redis.del(`scrapingJob:${id}`);

        return true;
      },
      createScrapingJobHistory: async (_: any, { input }: { input: ScrapingJobHistory }) => {
        const { scraping_job_id, started_at, ended_at, successful, content } = input;
        const timestamp = new Date().toISOString(); // current timestamp in ISO format
        const result = await pool.query(
          `
          INSERT INTO scraping_job_histories(scraping_job_id, started_at, ended_at, successful, content, created_at, updated_at) 
          VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [scraping_job_id, started_at, ended_at, successful, content, timestamp, timestamp]
        );
        return result.rows[0];
      },
    },
  };

  return resolvers;
};

export default getResolvers;
