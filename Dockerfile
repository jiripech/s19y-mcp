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
COPY name-pool.mjs .
COPY webauthn.mjs .
COPY browser-sessions.mjs .
COPY browser-routes.mjs .
COPY browser ./browser/
COPY entrypoint.sh .

# Bake the build tag into the service worker cache name so every
# release invalidates the browser cache automatically
ARG BUILD_TAG=dev
RUN sed -i "s/__BUILD_TAG__/${BUILD_TAG}/" browser/sw.js

RUN chmod +x entrypoint.sh

# Environment configuration
ENV PORT=3000
ENV DATA_DIR=/app/data
ENV MEMORY_FILE_PATH=/app/data/memory.jsonl
ENV NODE_OPTIONS=--disable-warning=ExperimentalWarning
VOLUME /app/data

EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]