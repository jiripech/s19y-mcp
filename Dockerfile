FROM node:current-alpine

# Keep base packages (e.g. OpenSSL) patched
RUN apk upgrade --no-cache

WORKDIR /app

# Install dependencies from lockfile (reproducible)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && rm -rf /usr/local/lib/node_modules/npm

# Copy application source
COPY server.mjs .
COPY memory-server.mjs .
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# Environment configuration
ENV PORT=3000
ENV DATA_DIR=/app/data
VOLUME /app/data

EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]