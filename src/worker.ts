// Scraper created by Adam Schwartz https://github.com/adamschwartz/web.scraper.workers.dev/tree/master
import Scraper from './scraper.js';

export interface Env {
  OPEN_AI_API_KEY: string;
  CORRECT_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // We only want to accept a POST request.
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Verify the request has the CORRECT_API_KEY, so if someone tries to call your endpoint and they don't know your secret they will get a 401 Unauthorized response
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || authHeader !== `Bearer ${env.CORRECT_API_KEY}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    // TS interface for the POST body. We want an href, description and selector
    interface FetchData {
      href: string;
      description: string;
      selector: string;
    }

    // Fetch the HTML content from the provided href that we wish to scrape
    const body: FetchData = (await request.json()) as FetchData;
    if (!body.href || !body.description || !body.selector) {
      return new Response('Bad request. Please include an href, selector, and description in the POST body.', { status: 400 });
    }

    // Initialize a new scraper and pass the fetched response to it
    const scraper = new Scraper();
    await scraper.fetch(body.href);

    // Use the scraper to get the text content of the specified elements
    const textContent = await scraper.querySelector(body.selector).getText({ spaced: false });

    // Serialize the text content to JSON
    const jsonData = JSON.stringify(textContent);

    try {
      // Send the JSON data to OpenAI's API
      const result = await sendToOpenAI(env, jsonData, body.href, body.description);

      // Return the result from OpenAI's API
      return new Response(JSON.stringify(result), { status: 200 });
    } catch (err: any) {
      console.error(err);

      // Do some error handling. If the error message includes "maximum context length is" then the JSON data provided was too large for OpenAI to process.
      if (err?.message?.includes('maximum context length is')) {
        return new Response('The JSON provided is too large for OpenAI to process.', { status: 413 });
      } else {
        return new Response(err?.message ? err.message : "OpenAI's API had a problem.", { status: 500 });
      }
    }
  },
};

async function sendToOpenAI(env: Env, rawHtml: string, href: string, description: string) {
  const body = {
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `You are a web scraper being asked to get content from ${href}. You have been provided with the scraped text values of certain DOM Element Tags. Your task is to parse these and extract the requested data as described. The format in your response should strictly be a JSON Array of the requested data with no additional text or formatting. If it's a singular item, it will be a JSON Array of 1 length. Here is a description of how to locate the content that we want from the site: ${description}. Treat this like you are an API endpoint, just return the JSON.`,
      },
      {
        role: 'user',
        content: `Parse the following scraped text values and locate the content as per the description provided: ${rawHtml}. Remember, no explanation. Just JSON.`,
      },
    ],
    temperature: 0.2,
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPEN_AI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorMessage = await response.text();
    throw new Error(`OpenAI API error: ${errorMessage}`);
  }

  interface OpenAIChoice {
    message: {
      content: string;
    };
  }

  interface OpenAIResponse {
    choices: OpenAIChoice[];
  }

  const data: OpenAIResponse = await response.json();
  return data['choices'][0]['message']['content'];
}
