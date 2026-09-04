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
COPY logger.mjs .
COPY names.mjs .
COPY webauthn.mjs .
COPY browser-sessions.mjs .
COPY browser-routes.mjs .
COPY browser ./browser/
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# Environment configuration
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV MEMORY_FILE_PATH=/app/data/memory.jsonl
VOLUME /app/data

EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]