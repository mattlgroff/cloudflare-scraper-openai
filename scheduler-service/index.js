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
      const task = cron.schedule(
        cron_schedule,
        () => {
          console.log('Running scraping job with id: ', id, ' at ', new Date());
          runScrapingJob(id);
        },
        {
          scheduled: true,
          timezone: 'America/New_York',
        }
      );

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

  try {
    // Fetch and schedule jobs immediately
    await fetchAndScheduleScrapingJobs();
  } catch (error) {
    console.error(`Error in main: ${error}`);
  }

  // TODO: Uncomment this to enable polling
  // Set up polling every 15 minutes
  // try {
  //   setInterval(fetchAndScheduleScrapingJobs, 15 * 60 * 1000);
  // } catch (error) {
  //   console.error(`Error in while polling in main: ${error}`);
  // }
}

app.get('/', async (req, res) => {
  try {
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
      <td><a href="/${scrapingJob.id}">${scrapingJob.id}</a></td>
      <td><a href="${scrapingJob.href}" target="_blank">${scrapingJob.href}</a></td>
      <td>${scrapingJob.selector}</td>
      <td>${scrapingJob.description}</td>
      <td><pre><code class="json">${
        scrapingJob.latest_content ? JSON.stringify(scrapingJob.latest_content, null, 2) : '❌'
      }</code></pre></td>
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
    <title>AI Scraping Hub - Scheduler Dashboard</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css" integrity="sha384-rbsA2VBKQhggwzxH7pPCaAqO46MgnOM80zW1RWuH61DGLwZJEdK2Kadq2F9CUG65" crossorigin="anonymous">
  </head>
  <body class="p-4">
    <h1 class="mb-4">AI Scraping Hub - Scheduler Dashboard</h1>
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
  } catch (error) {
    console.error(`Error in GET /: ${error}`);
    res.status(500).send('Error');
  }
});

app.get('/:id', async (req, res) => {
  const jobId = req.params.id;

  try {
    const response = await fetch(process.env.GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SCRAPER_API_TOKEN}`,
      },
      body: JSON.stringify({
        query: `
          query GetScrapingJobHistory($id: ID!) {
            scrapingJob(id: $id) {
              id
              description
              href
              selector
              cron_schedule
              histories {
                started_at
                ended_at
                successful
                content
              }
            }
          }
        `,
        variables: { id: jobId },
      }),
    });

    const {
      data: { scrapingJob },
    } = await response.json();

    let historyList = '';
    for (const history of scrapingJob.histories) {
      const startedAt = new Date(Number(history.started_at)).toLocaleString('en-US', { timeZone: 'America/New_York' });

      const endedAt = history.ended_at
        ? new Date(Number(history.ended_at)).toLocaleString('en-US', { timeZone: 'America/New_York' })
        : 'N/A';

      const content = history.content ? JSON.parse(history.content) : null;

      historyList += `
      <tr>
        <td>${startedAt} - US Eastern</td>
        <td>${endedAt} - US Eastern</td>
        <td>${history.successful ? '✅' : '❌'}</td>
        <td><pre><code class="json">${content ? JSON.stringify(content, null, 2) : '❌'}</code></pre></td>
      </tr>
    `;
    }

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>AI Scraping Hub - Job History</title>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css" integrity="sha384-rbsA2VBKQhggwzxH7pPCaAqO46MgnOM80zW1RWuH61DGLwZJEdK2Kadq2F9CUG65" crossorigin="anonymous">
    </head>
    <body class="p-4">
      <a href="/" class="btn btn-primary mb-4">Back to home page</a>
      <h1 class="mb-4">AI Scraping Hub - Job History for ID: ${jobId}</h1>
      <div>
        <strong>Description:</strong> ${scrapingJob.description} <br>
        <strong>Site:</strong> <a href="${scrapingJob.href}" target="_blank">${scrapingJob.href}</a> <br>
        <strong>CSS Selector:</strong> ${scrapingJob.selector} <br>
        <strong>Cron Schedule:</strong> ${scrapingJob.cron_schedule} (${cronstrue.toString(scrapingJob.cron_schedule)} US Eastern) <br>
      </div>
      <table class="table table-striped w-100 mt-4">
        <thead>
          <tr>
            <th>Started At</th>
            <th>Ended At</th>
            <th>Successful</th>
            <th>Content</th>
          </tr>
        </thead>
        <tbody>
          ${historyList}
        </tbody>
      </table>
    </body>
    </html>
    `;

    res.send(html);
  } catch (error) {
    console.error(`Error in GET /${jobId}: ${error}`);
    res.status(500).send('Error');
  }
});

// Set the default port to 3000, or use the PORT environment variable
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`AI 👾 Scraping Hub Scheduler Service - Listening on port http://localhost:${port}`);
  main(); // start the job scheduler
});
