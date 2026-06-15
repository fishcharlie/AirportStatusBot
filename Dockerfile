# Use the official Node.js image as a parent image
FROM node:22.14.0

# Set environment variables to avoid user interaction during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Update the package list and install gdal-bin
RUN apt-get update && \
	apt-get install -y gdal-bin && \
	apt-get clean

# Set the working directory
WORKDIR /project

# Copy the project files
COPY . /project

# Install project dependencies
RUN npm install

# Keep the long-running bot inside a conservative memory envelope.
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=384
ENV MALLOC_ARENA_MAX=2

# Set the command to run your app
CMD ["node", "dist/index.js"]
