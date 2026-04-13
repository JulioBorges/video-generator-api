# Build stage
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY tsconfig*.json ./
COPY src/ ./src/

RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build

# Production stage
FROM node:22-alpine

# System dependencies for Remotion + FFmpeg
RUN apk add --no-cache \
    ffmpeg \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto \
    && rm -rf /var/cache/apk/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production \
    DATA_DIR_PATH=/data

WORKDIR /app

COPY package*.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm install --legacy-peer-deps --omit=dev \
    && apk del .build-deps

# Compiled JS output
COPY --from=builder /app/dist ./dist

# Remotion TSX sources — required by @remotion/bundler at runtime
COPY --from=builder /app/src/remotion ./src/remotion

# Static assets (music, etc.)
COPY static/ ./static/

# Data directory (VPS volume area)
RUN mkdir -p /data/videos /data/temp && \
    mkdir -p /app/node_modules/.cache /app/node_modules/.remotion && \
    chown -R node:node /data /app/node_modules/.cache /app/node_modules/.remotion

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget -qO- http://localhost:${PORT:-3000}/health || exit 1

CMD ["node", "dist/index.js"]
