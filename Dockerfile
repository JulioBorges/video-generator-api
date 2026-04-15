# Build stage
FROM node:22-bookworm-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY tsconfig*.json ./
COPY src/ ./src/

RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build

# Production stage
FROM node:22-bookworm-slim

# System dependencies for Remotion + FFmpeg
# Remotion/Chromium dependencies for Debian Bookworm
RUN apt-get update && apt-get install -y \
    ffmpeg \
    chromium \
    fonts-liberation \
    fontconfig \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm1 \
    wget \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    DATA_DIR_PATH=/data

WORKDIR /app

COPY package*.json ./
RUN apt-get update && apt-get install -y python3 make g++ \
    && npm install --legacy-peer-deps --omit=dev \
    && apt-get remove -y python3 make g++ \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Compiled JS output
COPY --from=builder /app/dist ./dist

# Remotion TSX sources — required by @remotion/bundler at runtime
COPY --from=builder /app/src/remotion ./src/remotion
COPY --from=builder /app/src/types ./src/types
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Static assets (music, etc.)
COPY static/ ./static/

# Data directory (VPS volume area)
RUN mkdir -p /data/videos /data/temp && \
    mkdir -p /app/node_modules/.cache /app/node_modules/.remotion

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget -qO- http://localhost:${PORT:-3000}/health || exit 1

CMD ["node", "dist/index.js"]
