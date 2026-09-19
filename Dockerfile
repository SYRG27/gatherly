# Node 20 slim keeps the image small. @libsql/client ships prebuilt
# binaries — no compiler toolchain needed.
FROM node:20-slim

WORKDIR /app

# Install dependencies first (better layer caching).
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# App code.
COPY src ./src
COPY public ./public

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

CMD ["node", "src/server.js"]
