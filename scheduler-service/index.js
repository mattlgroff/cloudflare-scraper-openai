require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { runScrapingJob } = require('./runScrapingJob.js');
const cronstrue = require('cronstrue');

// Initialize the express app
const app = express();

let scheduledTasks = [];
let appStartTime;

async function fetchAndScheduleScrapingJobs() {
  try {
    // Cancel existing tasks
    for (let { task } of scheduledTasks) {
      task.stop();
    }
    // Fetch all scraping jobs
    const response = await fetch(process.env.GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SCRAPER_API_TOKEN}`,
      },
      body: JSON.stringify({ query: '{   allScrapingJobsCronSchedules { cron_schedule id } }' }),
    });
    const {
      data: { allScrapingJobsCronSchedules },
    } = await response.json();
    // Reset the tasks
    scheduledTasks = [];
    for (let job of allScrapingJobsCronSchedules) {
      const { id, cron_schedule } = job;
      // Create a cron job for each scraping job
      const task = cron.schedule(cron_schedule, () => {
        console.log('Running scraping job with id: ', id, ' at ', new Date());
        runScrapingJob(id);
      });
      // Save the task and jobId so we can cancel it later and use it for health check
      scheduledTasks.push({ task, jobId: id });
      console.log(`Scheduled job with id: ${id} and schedule: ${cron_schedule}`);
    }
  } catch (error) {
    console.error(`Error in fetchAndScheduleScrapingJobs: ${error}`);
  }
}

async function main() {
  // Record the start time
  appStartTime = new Date();

  // Fetch and schedule jobs immediately
  await fetchAndScheduleScrapingJobs();

  // Set up polling every 15 minutes
  setInterval(fetchAndScheduleScrapingJobs, 15 * 60 * 1000);
}

app.get('/', async (req, res) => {
  // Compute uptime in seconds
  const uptime = Math.floor((new Date().getTime() - appStartTime.getTime()) / 1000);

  // Build a list of scheduled tasks
  let taskList = '';
  for (const { jobId } of scheduledTasks) {
    const response = await fetch(process.env.GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SCRAPER_API_TOKEN}`,
      },
      body: JSON.stringify({ query: `{ scrapingJob(id: "${jobId}") { id href selector description cron_schedule latest_content } }` }),
    });

    const {
      data: { scrapingJob },
    } = await response.json();

    taskList += `
      <tr>
        <td>${scrapingJob.id}</td>
        <td>${scrapingJob.href}</td>
        <td>${scrapingJob.selector}</td>
        <td>${scrapingJob.description}</td>
        <td>${scrapingJob.latest_content ? JSON.stringify(scrapingJob.latest_content) : '❌'}</td>
        <td>${scrapingJob.cron_schedule}</td>
        <td>${cronstrue.toString(scrapingJob.cron_schedule)} US Eastern</td>
      </tr>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Bun Scheduler Dashboard</title>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css" integrity="sha384-rbsA2VBKQhggwzxH7pPCaAqO46MgnOM80zW1RWuH61DGLwZJEdK2Kadq2F9CUG65" crossorigin="anonymous">
      <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/js/bootstrap.min.js" integrity="sha384-cuYeSxntonz0PPNlHhBs68uyIAVpIIOZZ5JqeqvYYIcEL727kskC66kF92t6Xl2V" crossorigin="anonymous"></script>
    </head>
    <body class="p-4">
      <h1 class="mb-4">Bun Scheduler Dashboard</h1>
      <div class="mb-4">
        <strong>Uptime:</strong> ${uptime} seconds
      </div>
      <table class="table table-striped w-100">
        <thead>
          <tr>
            <th>Job ID</th>
            <th>URL</th>
            <th>Selector</th>
            <th>Description</th>
            <th>Latest Content</th>
            <th>Cron Schedule</th>
            <th>Cron Schedule Described</th>
          </tr>
        </thead>
        <tbody>
          ${taskList}
        </tbody>
      </table>
    </body>
    </html>
  `;

  res.send(html);
});

// Set the default port to 3000, or use the PORT environment variable
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Express 🥟 Server Listening on port http://localhost:${port}`);
  main(); // start the job scheduler
});
