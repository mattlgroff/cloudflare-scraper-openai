# AI Scraping Hub Project

## Overview

This project includes a Node.js Scheduler Service, two Cloudflare Workers (a scraper and an Apollo GraphQL server), and uses Neon PostgreSQL, Redis via Upstash, and Render.com for deployment. The application is designed to create and schedule web scraping jobs, execute them, and store and serve the results.

## Tech Stack

- Node.js Scheduler Service: A Node.js application responsible for polling the Neon PostgreSQL database every 15 minutes to retrieve the latest cron schedule based on the scraping_job table.
- Cloudflare Worker 1 - Scraper: This Cloudflare worker is responsible for executing the web scraping tasks.
- Cloudflare Worker 2 - Apollo GraphQL Server: This Cloudflare worker provides a GraphQL API for creating, reading, and updating scraping cron jobs.
- Neon PostgreSQL: The serverless PostgreSQL database used for storing the scraping job schedules and historical job results.
- Redis with Upstash.com: Used for caching.
- Render.com: Used for deploying the Node.js Scheduler Service.

## Using Docker Compose

In the root directory of the project, you will find a `docker-compose.yml` file. This file is used to define and run the Scheduler Service in a Docker container. 

To start the service, run the following command:

```
docker-compose up
```

Make sure Docker is installed on your machine before running the command.

## Cloudflare Workers

Refer to the individual README.md files in the Cloudflare worker directories for specific instructions on their usage.

## Billing

Here's a quick summary of the monthly costs associated with the services used in this project:

| Service             | Cost    |
|---------------------|---------|
| Render.com          | $7/mo   |
| Cloudflare Workers  | Free tier    |
| Redis (Upstash.com) | Free tier    |
| Neon Serverless PostgreSQL | Free tier    |
| **Total**           | **$7/mo** |

## System Architecture

The following diagram describes how the services interact:

```
Cloudflare Worker 1 (Scraper) <-------- Node.js Scheduler Service -------> Neon PostgreSQL
   ^                                       ^                                      |
   |                                       |                                      v
   |                                       |                                 Redis (Cache)
   |                                       |
Cloudflare Worker 2 (GraphQL Server) <----|
```

In this architecture:

- The Node.js Scheduler Service regularly checks the Neon PostgreSQL database for new scraping jobs.
- When a new job is found, it sends a request to the Scraper Cloudflare worker to execute the job.
- The Scraper worker retrieves the web data and sends it back to the Scheduler Service.
- The Scheduler Service then updates the job status and result in the Neon PostgreSQL database, and stores the result in Redis for caching.
- The GraphQL Server Cloudflare worker provides an API for managing the scraping jobs and accessing the latest job results.
