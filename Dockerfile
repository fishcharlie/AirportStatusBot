# Build the TypeScript application with all development dependencies available.
FROM node:22.14.0-bookworm AS build

WORKDIR /project

# Install dependencies deterministically before copying the full source tree.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
COPY assets ./assets
COPY radarColorIndex.csv ./
RUN npm run build

# Run the bot with only runtime dependencies and system tools.
FROM node:22.14.0-bookworm AS runtime

ENV NODE_ENV=production
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /project

# gdal-bin is required by the map/image generation path.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends gdal-bin ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# Keep the runtime layer smaller than the build layer.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /project/dist ./dist
COPY --from=build /project/assets ./assets
COPY --from=build /project/radarColorIndex.csv ./radarColorIndex.csv

# Runtime cache and config are mounted by Compose in production.
RUN mkdir -p cache

CMD ["node", "dist/index.js"]
