import { Redis } from '@upstash/redis/cloudflare';
import postgres from 'postgres';

const redis = Redis.fromEnv({
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL!,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function runScrapingJob(id: string, href: string, selector: string, description: string, sql: postgres.Sql) {
  const startedAt = new Date().toISOString();

  try {
    const response = await fetch(process.env.SCRAPER_API_URL!, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SCRAPER_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        href: href,
        selector: selector,
        description: description,
      }),
    });

    const content = await response.json();
    const successful = response.status === 200;
    const endedAt = new Date().toISOString();

    // Insert into scraping_job_histories
    await sql`
        INSERT INTO scraping_job_histories (scraping_job_id, started_at, ended_at, successful, content) 
        VALUES (${id}, ${startedAt}, ${endedAt}, ${successful}, ${JSON.stringify(content)})
    `;

    // Update Redis
    await redis.set(`scrapingJob:${id}`, JSON.stringify(content));
  } catch (error) {
    const endedAt = new Date().toISOString();

    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    // Even on failure, we want to record the attempt in scraping_job_histories
    await sql`
        INSERT INTO scraping_job_histories (scraping_job_id, started_at, ended_at, successful, content) 
        VALUES (${id}, ${startedAt}, ${endedAt}, false, ${JSON.stringify({ error: errorMessage })})
    `;

    console.error(`Error in runScrapingJob for job ${id}: ${error}`);
  }
}
