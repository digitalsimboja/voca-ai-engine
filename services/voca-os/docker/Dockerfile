# Use Node.js 18 Alpine as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package.json files first for better caching
COPY services/voca-os/package.json ./package.json
COPY services/voca-os/agent/package.json ./agent/package.json
COPY services/voca-os/packages/core/package.json ./packages/core/package.json
COPY services/voca-os/packages/client-direct/package.json ./packages/client-direct/package.json
COPY services/voca-os/packages/plugin-bootstrap/package.json ./packages/plugin-bootstrap/package.json

# Copy pnpm workspace configuration
COPY services/voca-os/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY services/voca-os/pnpm-lock.yaml ./pnpm-lock.yaml

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy ElizaOS source code (only essential packages)
COPY services/voca-os/agent ./agent
COPY services/voca-os/packages ./packages
COPY services/voca-os/characters ./characters

# Copy Voca OS services (both dev and prod)
COPY services/voca-os/dev-voca-os-service.js ./dev-voca-os-service.js
COPY services/voca-os/prod-voca-os-service.js ./prod-voca-os-service.js

# Create characters directory if it doesn't exist
RUN mkdir -p characters/dynamic

# Expose port
EXPOSE 5001

# Set environment variables
ENV NODE_ENV=development
ENV PORT=5001

# Start the appropriate Voca OS service based on NODE_ENV
CMD ["sh", "-c", "if [ \"$NODE_ENV\" = \"development\" ]; then node dev-voca-os-service.js; else node prod-voca-os-service.js; fi"]
