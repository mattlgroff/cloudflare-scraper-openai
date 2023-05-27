# Use the official node alpine image from the dockerhub
FROM node:18.16-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package.json package.json
COPY package-lock.json package-lock.json

# Install dependencies
RUN npm install

# Only copy the relevant files
COPY index.js ./index.js
COPY runScrapingJob.js ./runScrapingJob.js

# Expose port 3000 to the host (this doesn't publish the port)
EXPOSE 3000

# Command to run when the container starts
ENTRYPOINT ["node", "index.js"]
