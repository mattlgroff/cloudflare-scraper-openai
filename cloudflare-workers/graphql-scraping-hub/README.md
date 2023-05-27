## GraphQL Server for Scraping Hub

## Get Started
Install the [wrangler](https://developers.cloudflare.com/workers/wrangler/install-and-update/) cli. You can do so with the following command:
```bash
npm install -g wrangler
```

Then login to your Cloudflare account with the following command:
```bash
wrangler login
```

Next, copy the .example.wrangler.toml file to wrangler.toml and fill in the appropriate values.
```toml
name = "graphql-scraping-hub"
main = "src/worker.ts"
compatibility_date = "2023-05-26"
node_compat = true

[vars]
DATABASE_URL = ""
SCRAPER_API_TOKEN = ""
UPSTASH_REDIS_REST_TOKEN = ""
UPSTASH_REDIS_REST_URL = ""
```

`DATABASE_URL` you can get from your PostgreSQL Cloud Provider. It's a cloudflare worker, it's gotta be on the cloud.

`SCRAPER_API_TOKEN` you supply whatever you wish to be the accepted Bearer token for the API. This is used to authenticate the request. You can use whatever random string or password you want, but the request to the Cloudflare Worker endpoint needs include the following in the headers:
```
Authorization: Bearer <your-scraper_api_token>
```

Finally, publish the worker with the following command:
```bash
npm run deploy
```

## Accessing
When you run deploy you'll see something like the following output:
```bash
Published graphql-scraping-hub (0.61 sec)
  https://graphql-scraping-hub.yourusername.workers.dev
Current Deployment ID: df30b547-ecaa-4941-be4e-a961c3b22f08
```

Just visit that url and you'll see the GraphQL Playground (now called Apollo Studio) where you can test out your queries and mutations.

```graphql
query ExampleQuery {
  users {
    email
    scrapingJobs {
      id
      href
      description
      cron_schedule
      latest_content
    }
  }
}
```

Make sure you set your Authorization header to Bearer <your-scraper_api_token> in the HTTP Headers section of the playground/apollo studio. If you don't, then no API calls will work.