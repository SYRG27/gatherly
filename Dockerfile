# Node 20 slim keeps the image small; better-sqlite3 compiles at build time.
FROM node:20-slim

# Build tools needed to compile better-sqlite3 from source.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (better layer caching).
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# App code. DATA_DIR (/data) is a mounted volume, not baked into the image.
COPY src ./src
COPY public ./public

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "src/server.js"]
