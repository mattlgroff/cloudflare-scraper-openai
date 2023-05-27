import { ApolloServer } from '@apollo/server';
import { startServerAndCreateCloudflareWorkersHandler } from '@as-integrations/cloudflare-workers';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { ApolloServerErrorCode } from '@apollo/server/errors';
import gql from 'graphql-tag';
import GraphQLJSON from 'graphql-type-json';
import getResolvers from './resolvers';

const typeDefs = gql`
  scalar JSON

  type User {
    id: ID!
    email: String
    name: String
    scrapingJobs: [ScrapingJob]
  }

  type ScrapingJob {
    id: ID!
    user_id: ID!
    href: String
    selector: String
    description: String
    cron_schedule: String
    latest_content: JSON
  }

  type Query {
    users: [User]
    scrapingJob(id: ID!): ScrapingJob
  }

  type Mutation {
    createScrapingJob(input: ScrapingJobInput): ScrapingJob
    updateScrapingJob(id: ID!, input: ScrapingJobInput): ScrapingJob
    deleteScrapingJob(id: ID!): Boolean
  }

  input ScrapingJobInput {
    user_id: ID!
    href: String!
    selector: String!
    description: String
    cron_schedule: String!
  }
`;

export interface Env {
  DATABASE_URL: string;
  REDIS_URL: string;
  SCRAPER_API_URL: string;
  SCRAPER_API_TOKEN: string;
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const server = new ApolloServer({
      typeDefs,
      resolvers: {
        JSON: GraphQLJSON,
        ...getResolvers(env),
      },
      formatError: (formattedError, error) => {
        console.log('formattedError', formattedError);
        console.log('error', error);
        // Return a different error message
        if (formattedError?.extensions?.code === ApolloServerErrorCode.GRAPHQL_VALIDATION_FAILED) {
          return {
            ...formattedError,
            message: "Your query doesn't match the schema. Try double-checking it!",
          };
        }

        // Otherwise return the formatted error. This error can also
        // be manipulated in other ways, as long as it's returned.
        return formattedError;
      },
      introspection: true,
      plugins: [ApolloServerPluginLandingPageLocalDefault({ footer: false })],
    });

    const handleGraphQLRequest = startServerAndCreateCloudflareWorkersHandler(server, {
      context: async ({ request }) => {
        // verify API key and add user to context
        const authHeader = request.headers.get('Authorization');
        const token = authHeader && authHeader.split(' ')[1];

        if (!token || token !== env.SCRAPER_API_TOKEN) {
          throw new Error('Unauthorized');
        }

        return { token };
      },
    });

    return handleGraphQLRequest(request);
  },
};
