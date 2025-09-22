# Use official Bun image
FROM oven/bun:1.2.15-alpine

WORKDIR /app

# Copy only manifest files first (better caching)
COPY services/voca-os/package.json ./package.json

# Install dependencies
RUN bun install

# Copy source files AFTER installing deps
COPY services/voca-os/voca-os-service.js ./voca-os-service.js
COPY services/voca-os/src ./src
COPY services/voca-os/characters ./characters

# Ensure dynamic characters dir
RUN mkdir -p /app/characters/dynamic

EXPOSE 5001
ENV NODE_ENV=production
ENV PORT=5001

# Start service
CMD ["bun", "run", "voca-os-service.js"]
