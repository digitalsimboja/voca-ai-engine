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

# Install all deps, including optional + postinstall scripts
RUN bun install

# Copy source after installing deps
COPY services/voca-os/voca-os-service.js ./voca-os-service.js
COPY services/voca-os/src ./src
COPY services/voca-os/characters ./characters

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

# Copy everything from builder
COPY --from=builder /app ./

# Ensure dynamic characters dir
RUN mkdir -p /app/characters/dynamic

EXPOSE 5001
ENV NODE_ENV=production
ENV PORT=5001

CMD ["bun", "run", "voca-os-service.js"]
