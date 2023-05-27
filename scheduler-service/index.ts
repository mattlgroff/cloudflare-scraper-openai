import postgres from 'postgres';
import cron from 'node-cron';
import { runScrapingJob } from './runScrapingJob';

const { PGHOST, PGDATABASE, PGUSER, PGPASSWORD, ENDPOINT_ID } = process.env;
const URL = `postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}/${PGDATABASE}?options=project%3D${ENDPOINT_ID}`;

const sql = postgres(URL, { ssl: 'require' });

let scheduledTasks: cron.ScheduledTask[] = [];

async function fetchAndScheduleScrapingJobs() {
  try {
    // Cancel existing tasks
    for (let task of scheduledTasks) {
      task.stop();
    }

    // Fetch all scraping jobs
    const rows = await sql`SELECT * FROM scraping_jobs`;

    // Reset the tasks
    scheduledTasks = [];

    for (let job of rows) {
      const { id, href, selector, description, cron_schedule } = job;

      // Create a cron job for each scraping job
      const task = cron.schedule(
        cron_schedule,
        () => {
          runScrapingJob(id, href, selector, description, sql);
        },
        {
          scheduled: true,
          timezone: 'America/New_York',
        }
      );

      // Save the task so we can cancel it later
      scheduledTasks.push(task);

      console.log(`Scheduled job with id: ${id} and schedule: ${cron_schedule}`);
    }
  } catch (error) {
    console.error(`Error in fetchAndScheduleScrapingJobs: ${error}`);
  }
}

async function main() {
  // Fetch and schedule jobs immediately
  await fetchAndScheduleScrapingJobs();

  // Set up polling every 15 minutes
  setInterval(fetchAndScheduleScrapingJobs, 15 * 60 * 1000);
}

main();
