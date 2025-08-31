# Use Node.js 18 Alpine as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package.json files first for better caching
COPY package.json ./package.json
COPY agent/package.json ./agent/package.json
COPY packages/core/package.json ./packages/core/package.json
COPY packages/client-direct/package.json ./packages/client-direct/package.json
COPY packages/plugin-bootstrap/package.json ./packages/plugin-bootstrap/package.json

# Copy pnpm workspace configuration
COPY pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY pnpm-lock.yaml ./pnpm-lock.yaml

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy ElizaOS source code (only essential packages)
COPY agent ./agent
COPY packages ./packages
COPY characters ./characters

# Copy Voca OS services (both dev and prod)
COPY dev-voca-os-service.js ./dev-voca-os-service.js
COPY prod-voca-os-service.js ./prod-voca-os-service.js

# Build ElizaOS packages
RUN pnpm --filter "@elizaos/core" build
RUN pnpm --filter "@elizaos/client-direct" build
RUN pnpm --filter "@elizaos/plugin-bootstrap" build

# Create characters directory if it doesn't exist
RUN mkdir -p characters/dynamic

# Expose port
EXPOSE 3001

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Start the Voca OS production service
CMD ["node", "prod-voca-os-service.js"]
