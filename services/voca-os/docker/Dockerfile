# Stage 1: Builder with full Bun runtime
FROM oven/bun:1.2.15 AS builder

WORKDIR /app

# Install system deps (avoid alpine headaches)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ffmpeg \
    git \
    python3 \
    unzip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy manifest files first (cache layer)
COPY services/voca-os/package.json ./package.json
COPY services/voca-os/tsconfig.json ./tsconfig.json

# Install all deps, including optional + postinstall scripts
RUN bun install

# Copy source after installing deps
COPY services/voca-os/voca-os-service.ts ./voca-os-service.ts
COPY services/voca-os/src ./src
COPY services/voca-os/plugins ./plugins
COPY services/voca-os/characters ./characters

# Build TypeScript
RUN bun run build

# Stage 2: Runtime
FROM oven/bun:1.2.15

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    ffmpeg \
    git \
    python3 \
    unzip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/plugins ./plugins
COPY --from=builder /app/characters ./characters
COPY --from=builder /app/package.json ./package.json

# Install only production dependencies
RUN bun install --production

# Ensure dynamic characters dir and eliza data dir
RUN mkdir -p /app/characters/dynamic
RUN mkdir -p /app/.eliza/.elizadb

EXPOSE 5001
ENV NODE_ENV=production
ENV PORT=5001

CMD ["bun", "run", "start"]
