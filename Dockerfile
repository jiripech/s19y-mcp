# Build llama-server (CPU-only, native optimizations) for the
# bundled compression model
FROM debian:bookworm AS llm-builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential cmake git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
# Pin to a stable llama.cpp release: follows the project's new vX.Y.Z
# stable tags instead of chasing a moving HEAD (HEAD snapshots can
# crash with SIGILL on some CPUs due to runtime dispatch bugs).
RUN git clone --depth 1 --branch v0.4.0 https://github.com/ggerganov/llama.cpp.git .
# GGML_NATIVE=OFF: on aarch64 the native flag mismatches gcc's
# baseline with fp16 NEON intrinsics; runtime dispatch works on
# both amd64 and arm64. IMPORTANT: with GGML_NATIVE=OFF the cmake
# INS_ENB logic enables *every* GGML_<ISA> option by default, which
# compiles the whole x86 backend with global -mavx2/-mfma/-mf16c
# flags. On NAS CPUs without AVX (e.g. old/virtualized x86_64) the
# first execute AVX instruction faults with SIGILL (exit 132, empty
# log). Force the portable SSE2 baseline by disabling all of them.
RUN cmake -B build -DGGML_NATIVE=OFF \
    -DGGML_SSE42=OFF -DGGML_AVX=OFF -DGGML_AVX2=OFF \
    -DGGML_FMA=OFF -DGGML_F16C=OFF -DGGML_BMI2=OFF \
    -DGGML_AVX_VNNI=OFF -DGGML_AVX512=OFF -DGGML_AVX512_VBMI=OFF \
    -DGGML_AVX512_VNNI=OFF -DGGML_AVX512_BF16=OFF \
    -DGGML_AMX_TILE=OFF -DGGML_AMX_INT8=OFF -DGGML_AMX_BF16=OFF \
    && cmake --build build --config Release -j"$(nproc)" \
    && strip build/bin/llama-server

FROM node:26.8.2-bookworm-slim

# Keep base packages patched; nginx terminates TLS in front of Node.
# curl + ca-certificates drive the bundled MODEL download and the SMTP
# log alerts; libgomp1 supplies OpenMP for the bundled llama-server.
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends nginx curl ca-certificates libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# llama.cpp builds the server binary plus its shared libraries
# (libllama-server-impl.so, ggml backends) - copy only llama-server and
# the *.so* it needs, skipping the ~50 companion tools and test binaries.
COPY --from=llm-builder /src/build/bin/llama-server /src/build/bin/lib*.so* /usr/local/lib/llama/

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
COPY llm-watch.mjs .
COPY logger.mjs .
COPY names.mjs .
COPY name-pool.mjs .
COPY agent-registry.mjs .
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
ENV APP_PORT=3001
ENV APP_HOST=127.0.0.1
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