require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { runScrapingJob } = require('./runScrapingJob.js');
const cronstrue = require('cronstrue');
const cronParser = require('cron-parser');
const bodyParser = require('body-parser');

// Initialize the express app
const app = express();
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

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

const head = (title) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="AI Scraping Hub - Easily create and monitor your scraping jobs. Get the data you need in the format you want.">
  <title>${title ? title : 'AI Scraping Hub'}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css" integrity="sha384-rbsA2VBKQhggwzxH7pPCaAqO46MgnOM80zW1RWuH61DGLwZJEdK2Kadq2F9CUG65" crossorigin="anonymous">
</head>
`;

const errorPage = `
${head('AI Scraping Hub - Error')}
<body class="container">
  <h1>An Error Occurred</h1>
  <p>Sorry, there was an error processing your request. Please try again later.</p>
</body>
</html>
`;

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
        body: JSON.stringify({ query: `{ scrapingJob(id: "${jobId}") { id href selector description cron_schedule } }` }),
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
      <td>${scrapingJob.cron_schedule}</td>
      <td>${cronstrue.toString(scrapingJob.cron_schedule)} US Eastern</td>
    </tr>
  `;
    }

    const html = `
  ${head('AI Scraping Hub - Scheduler Dashboard')}
  <body class="container">
    <h1 class="mb-4">AI Scraping Hub - Scheduler Dashboard</h1>
    <a href="/new" class="btn btn-primary mb-4">Create a new scraping job</a>
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
    res.status(500).send(errorPage);
  }
});

app.get('/new', (req, res) => {
  const html = `
    ${head('AI Scraping Hub - New Job')}
    <body class="container">
      <h1>Create a new scraping job</h1>
      <p>
        Please fill the form with the following information:
        <ul>
          <li><b>URL (href):</b> The url of the site to scrape.</li>
          <li><b>Selector:</b> CSS selectors (comma separated, ex: "table, td, th").</li>
          <li><b>Description:</b> Describe to OpenAI how to turn the selected text into your desired JSON format.</li>
          <li><b>Cron Schedule:</b> How often it should run (ex: "0 7 * * *" would mean 7 AM. All times are US Eastern not UTC).</li>
        </ul>
      </p>
      <form action="/new" method="POST">
        <div class="mb-3">
          <label for="href" class="form-label">URL (href)</label>
          <input type="url" class="form-control" id="href" name="href" required>
        </div>
        <div class="mb-3">
          <label for="selector" class="form-label">Selector</label>
          <input type="text" class="form-control" id="selector" name="selector" required>
        </div>
        <div class="mb-3">
          <label for="description" class="form-label">Description</label>
          <textarea class="form-control" id="description" name="description" rows="3" required></textarea>
        </div>
        <div class="mb-3">
          <label for="cron_schedule" class="form-label">Cron Schedule</label>
          <input type="text" class="form-control" id="cron_schedule" name="cron_schedule" required>
        </div>
        <button type="submit" class="btn btn-primary">Create Job</button>
        <a href="/" class="btn btn-danger">Cancel</a>
      </form>
    </body>
    </html>
  `;
  res.send(html);
});

app.post('/new', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const { href, selector, description, cron_schedule, invite_code } = req.body;

    // TODO: Someday if I want more users I'll have to implement authentication and authorization here
    const user_id = 'cf63f138-d7e8-48ed-bc79-721585f3c7c8';

    const response = await fetch(process.env.GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SCRAPER_API_TOKEN}`,
      },
      body: JSON.stringify({
        query: `
          mutation CreateScrapingJob($input: ScrapingJobInput) {
            createScrapingJob(input: $input) {
              id
            }
          }
        `,
        variables: {
          input: { user_id, href, selector, description, cron_schedule },
        },
      }),
    });

    const {
      data: { createScrapingJob },
    } = await response.json();

    if (createScrapingJob && createScrapingJob.id) {
      await fetchAndScheduleScrapingJobs();
      res.redirect('/');
    } else {
      throw new Error('Job creation failed');
    }
  } catch (error) {
    res.status(500).send(errorPage);
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

    if (!scrapingJob) {
      const html = `
        ${head('AI Scraping Hub - Job Not Found')}
        <body class="container">
          <h1>404 - Scraping Job Not Found</h1>
          <p>A job with that id could not be found.</p>
          <a href="/" class="btn btn-primary">Go back</a>
        </body>
        </html>
      `;
      res.status(404).send(html);
      return;
    }

    const cronExpression = cronParser.parseExpression(scrapingJob.cron_schedule, { tz: 'America/New_York' });
    const nextRun = cronExpression.next().getTime();
    const now = new Date().getTime();
    const diffInMinutes = Math.floor((nextRun - now) / 1000 / 60);

    let timeUntilNextRun = '';
    if (diffInMinutes < 60) {
      timeUntilNextRun = `${diffInMinutes} minutes`;
    } else {
      const hours = Math.floor(diffInMinutes / 60);
      const minutes = diffInMinutes % 60;
      timeUntilNextRun = `${hours} hours and ${minutes} minutes`;
    }

    if (!scrapingJob.histories || scrapingJob.histories.length === 0) {
      const html = `
      ${head(`AI Scraping Hub - Job History for ID: ${jobId}`)}
      <body class="container">
        <h1 class="mb-4">Job History for ID: ${jobId}</h1>
        <a href="/" class="btn btn-primary mb-4">Back to home page</a>
        <div>
          <strong>Description:</strong> ${scrapingJob.description} <br>
          <strong>Site:</strong> <a href="${scrapingJob.href}" target="_blank">${scrapingJob.href}</a> <br>
          <strong>CSS Selector:</strong> ${scrapingJob.selector} <br>
          <strong>Cron Schedule:</strong> ${scrapingJob.cron_schedule} (${cronstrue.toString(scrapingJob.cron_schedule)} US Eastern) <br>
        </div>
        <div class="alert alert-warning" role="alert">
          No jobs have run yet for this job. They are scheduled to run at ${scrapingJob.cron_schedule} (${cronstrue.toString(
        scrapingJob.cron_schedule
      )} US Eastern).
        </div>
        <div class="alert alert-info" role="alert">
          The next job will run at ${timeUntilNextRun} at ${scrapingJob.cron_schedule} (${cronstrue.toString(
        scrapingJob.cron_schedule
      )} US Eastern).

      <form action="/run_job" method="post" style="display:inline-block;">
  <input type="hidden" name="jobId" value="${jobId}">
  <input type="submit" value="Run job now" class="btn btn-primary mb-4">
</form>
        </div>
      </body>
      </html>
      `;

      res.send(html);
      return;
    }

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
    ${head(`AI Scraping Hub - Job History for ID: ${jobId}`)}
    <body class="container">
      <h1 class="mb-4">Job History for ID: ${jobId}</h1>
      <a href="/" class="btn btn-primary mb-4">Back to home page</a>
      <div>
        <strong>Description:</strong> ${scrapingJob.description} <br>
        <strong>Site:</strong> <a href="${scrapingJob.href}" target="_blank">${scrapingJob.href}</a> <br>
        <strong>CSS Selector:</strong> ${scrapingJob.selector} <br>
        <strong>Cron Schedule:</strong> ${scrapingJob.cron_schedule} (${cronstrue.toString(scrapingJob.cron_schedule)} US Eastern) <br>
      </div>
      <div class="alert alert-info" role="alert">
        The next job will run at ${timeUntilNextRun} seconds at (${cronstrue.toString(scrapingJob.cron_schedule)} US Eastern).
        <form action="/run_job" method="post" style="display:inline-block;">
  <input type="hidden" name="jobId" value="${jobId}">
  <input type="submit" value="Run job now" class="btn btn-primary mb-4">
</form>

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

    res.status(500).send(errorPage);
  }
});

app.post('/run_job', async (req, res) => {
  const jobId = req.body.jobId;

  if (!jobId) {
    res.status(400).send(errorPage);
    return;
  }

  try {
    await runScrapingJob(jobId);
    res.redirect(`/${jobId}`);
  } catch (error) {
    console.error(`Error in POST /run_job: ${error}`);
    res.status(500).send(errorPage);
  }
});

// Set the default port to 3000, or use the PORT environment variable
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`AI 👾 Scraping Hub Scheduler Service - Listening on port http://localhost:${port}`);
  main(); // start the job scheduler
});
