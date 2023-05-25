## HTML Scraper with OpenAI API and Cloudflare Workers

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
name = "scraper"
main = "src/worker.ts"
compatibility_date = "2023-05-25"

[vars]
OPEN_AI_API_KEY = "your-open-ai-api-key"
CORRECT_API_KEY = "your-correct-api-key"
```

`OPEN_AI_API_KEY` you get from [OpenAI](https://platform.openai.com/account/api-keys).

`CORRECT_API_KEY` you supply whatever you wish to be the accepted Bearer token for the API. This is used to authenticate the request. You can use whatever random string or password you want, but the request to the Cloudflare Worker endpoint needs include the following in the headers:
```
Authorization: Bearer <your-correct-api-key>
```

Finally, publish the worker with the following command:
```bash
npm run deploy
```