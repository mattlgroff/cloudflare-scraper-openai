const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function runScrapingJob(id) {
  const startedAt = new Date().toISOString();

  try {
    // Fetch scraping job details from GraphQL
    const scrapingJobDetails = await fetch(process.env.GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SCRAPER_API_TOKEN}`,
      },
      body: JSON.stringify({ query: `{ scrapingJob(id: "${id}") { id href selector description } }` }),
    });

    const {
      data: { scrapingJob },
    } = await scrapingJobDetails.json();

    const { href, selector, description } = scrapingJob;

    // Run the scraping job using the Scraper Cloudflare Worker
    const response = await fetch(process.env.SCRAPER_API_URL, {
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

    // Insert into scraping_job_histories using a mutation
    await fetch(process.env.GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SCRAPER_API_TOKEN}`,
      },
      body: JSON.stringify({
        query: `
          mutation {
            createScrapingJobHistory(input: {
              scraping_job_id: "${id}",
              started_at: "${startedAt}",
              ended_at: "${endedAt}",
              successful: ${successful},
              content: ${JSON.stringify(content)}
            }) {
              id
            }
          }
        `,
      }),
    });

    // Update Redis
    await redis.set(`scrapingJob:${id}`, JSON.stringify(content));
  } catch (error) {
    const endedAt = new Date().toISOString();

    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    // Even on failure, we want to record the attempt in scraping_job_histories
    await fetch(process.env.GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SCRAPER_API_TOKEN}`,
      },
      body: JSON.stringify({
        mutation: `
          mutation {
            createScrapingJobHistory(input: {
              scraping_job_id: "${id}",
              started_at: "${startedAt}",
              ended_at: "${endedAt}",
              successful: false,
              content: ${JSON.stringify({ error: errorMessage })}
            }) {
              id
            }
          }
        `,
      }),
    });

    console.error(`Error in runScrapingJob for job ${id}: ${error}`);
  }
}

module.exports = {
  runScrapingJob,
};
