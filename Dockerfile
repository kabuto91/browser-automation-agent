FROM node:20-slim

LABEL maintainer="Browser Automation Agent"
LABEL description="Sandboxed browser automation testing agent"

RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash -u 1000 agent

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production && npm cache clean --force

RUN npx playwright install chromium --with-deps

COPY . .

RUN npm run build

RUN chown -R agent:agent /app

USER agent

ENV NODE_ENV=production
ENV HEADLESS=true
ENV URL_WHITELIST_ENABLED=false
ENV BLOCK_DANGEROUS_PROTOCOLS=true

RUN mkdir -p /app/screenshots /app/reports

VOLUME ["/app/screenshots", "/app/reports"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["npm", "start"]