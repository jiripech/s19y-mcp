# Build llama-server (CPU-only, native optimizations) for the
# bundled compression model
FROM debian:bookworm AS llm-builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth 1 https://github.com/ggerganov/llama.cpp.git .
# GGML_NATIVE=OFF: on aarch64 the native flag mismatches gcc's
# baseline with fp16 NEON intrinsics; runtime dispatch works on
# both amd64 and arm64
RUN cmake -B build -DGGML_NATIVE=OFF \
    && cmake --build build --config Release -j"$(nproc)" \
    && strip build/bin/llama-server

FROM node:current-bookworm

# Keep base packages patched
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

# llama.cpp builds the server binary plus its shared libraries
# (libllama-server-impl.so, ggml backends) - copy the whole set
COPY --from=llm-builder /src/build/bin/ /usr/local/lib/llama/

WORKDIR /app

# Install dependencies from lockfile (reproducible)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && rm -rf /usr/local/lib/node_modules/npm

# Copy application source
COPY server.mjs .
COPY memory-server.mjs .
COPY migrate.mjs .
COPY compressor.mjs .
COPY logger.mjs .
COPY names.mjs .
COPY name-pool.mjs .
COPY webauthn.mjs .
COPY browser-sessions.mjs .
COPY browser-routes.mjs .
COPY info-store.mjs .
COPY info-routes.mjs .
COPY instructions.mjs .
COPY browser ./browser/
COPY info ./info/
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
ENV LLM_ENABLED=true
ENV LLM_MODEL_URL=https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf
ENV LLM_MODEL_PATH=/app/data/model.gguf
ENV LLM_PORT=8080
ENV LLM_CONTEXT=4096
ENV LLM_THREADS=4
ENV COMPRESSION_ENDPOINT=http://127.0.0.1:8080/v1
ENV COMPRESSION_MODEL=qwen2.5-3b-instruct
VOLUME /app/data

EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]