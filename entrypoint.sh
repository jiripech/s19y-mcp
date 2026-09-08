#!/bin/sh
# shellcheck disable=SC3045

MAX_RETRIES=5
RETRY_COUNT=0
MAX_SLEEP=60

check_api_key() {
  if [ -z "$API_KEY" ]; then
    echo "[ERROR] API_KEY environment variable is not set."
    return 1
  fi
  if [ "$API_KEY" = "change-to-your-api-key" ]; then
    echo "[ERROR] API_KEY is set to default value. Please set a secure key."
    return 1
  fi
  return 0
}

start_llm() {
  if [ "$LLM_ENABLED" = "false" ]; then
    echo "[INFO] Bundled language model disabled (LLM_ENABLED=false)."
    return 0
  fi
  MODEL_URL="${LLM_MODEL_URL:-https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf}"
  MODEL_PATH="${LLM_MODEL_PATH:-/app/data/model.gguf}"
  LLM_PORT="${LLM_PORT:-8080}"
  LLM_CONTEXT="${LLM_CONTEXT:-4096}"
  LLM_THREADS="${LLM_THREADS:-4}"

  if [ ! -s "$MODEL_PATH" ]; then
    echo "[INFO] Downloading LLM model to $MODEL_PATH (first start)..."
    if curl -fL "$MODEL_URL" -o "$MODEL_PATH.part"; then
      mv "$MODEL_PATH.part" "$MODEL_PATH"
      echo "[INFO] LLM model downloaded."
    else
      rm -f "$MODEL_PATH.part"
      echo "[ERROR] LLM model download failed. The memory compressor will retry every tick until the model is available."
      return 0
    fi
  else
    echo "[INFO] LLM model found at $MODEL_PATH."
  fi

  echo "[INFO] Starting llama-server (port $LLM_PORT, context $LLM_CONTEXT, threads $LLM_THREADS)..."
  LD_LIBRARY_PATH=/usr/local/lib/llama \
    /usr/local/lib/llama/llama-server -m "$MODEL_PATH" -c "$LLM_CONTEXT" -t "$LLM_THREADS" \
    --host 127.0.0.1 --port "$LLM_PORT" >"$DATA_DIR/llama-server.log" 2>&1 &

  i=0
  while [ "$i" -lt 120 ]; do
    if curl -sf "http://127.0.0.1:$LLM_PORT/health" >/dev/null 2>&1; then
      echo "[INFO] llama-server is healthy."
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "[ERROR] llama-server did not become healthy in time. The memory compressor will retry every tick."
  return 0
}

if check_api_key; then
  echo "[INFO] API_KEY is configured. Starting server..."
  start_llm
  exec node server.mjs
fi

echo "[WARN] Waiting for API_KEY to be configured..."

while [ "$RETRY_COUNT" -lt "$MAX_RETRIES" ]; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  SLEEP_TIME=$((RETRY_COUNT * 12))
  if [ "$SLEEP_TIME" -gt "$MAX_SLEEP" ]; then
    SLEEP_TIME=$MAX_SLEEP
  fi

  echo "[WARN] Attempt $RETRY_COUNT/$MAX_RETRIES - retrying in ${SLEEP_TIME}s..."
  sleep "$SLEEP_TIME"

  if check_api_key; then
    echo "[INFO] API_KEY is configured. Starting server..."
    start_llm
    exec node server.mjs
  fi
done

echo "[FATAL] Failed to start after $MAX_RETRIES attempts. API_KEY is required."
exit 1
