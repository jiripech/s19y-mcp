#!/bin/sh
# shellcheck disable=SC3045

DATA_DIR="${DATA_DIR:-/app/data}"
MAX_MODEL_DOWNLOAD_RETRIES="${LLM_RETRIES:-3}"
LLM_TIMEOUT="${LLM_TIMEOUT:-120}"

llm_status() {
  echo "$1" >"$DATA_DIR/llm.status"
}

resolve_data_path() {
  case "$1" in
    /*|"") printf '%s' "$1" ;;
    *) printf '%s/%s' "$DATA_DIR" "$1" ;;
  esac
}

check_api_key() {
  if [ -z "$API_KEY" ] || [ "$API_KEY" = "change-to-your-api-key" ]; then
    API_KEY="$(node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))")"
    export API_KEY
    echo "[INFO] No API_KEY set; generated a random key: $API_KEY"
    echo "[INFO] MCP clients must authenticate with this key (set API_KEY for a stable key)."
  fi
  return 0
}

start_llm() {
  if [ "$LLM_ENABLED" = "false" ]; then
    echo "[INFO] Bundled language model disabled (LLM_ENABLED=false)."
    llm_status "disabled"
    return 0
  fi
  MODEL_URL="${LLM_MODEL_URL:-https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf}"
  MODEL_PATH="$(resolve_data_path "${LLM_MODEL_PATH:-/app/data/model.gguf}")"
  LLM_PORT="${LLM_PORT:-8080}"
  LLM_CONTEXT="${LLM_CONTEXT:-4096}"
  LLM_THREADS="${LLM_THREADS:-4}"

  if [ ! -s "$MODEL_PATH" ]; then
    echo "[INFO] Downloading LLM model to $MODEL_PATH (first start)..."
    llm_status "downloading"
    mkdir -p "$(dirname "$MODEL_PATH")"
    attempt=0
    downloaded=0
    while [ "$attempt" -lt "$MAX_MODEL_DOWNLOAD_RETRIES" ]; do
      attempt=$((attempt + 1))
      if curl -fL "$MODEL_URL" -o "$MODEL_PATH.part"; then
        mv "$MODEL_PATH.part" "$MODEL_PATH"
        echo "[INFO] LLM model downloaded."
        downloaded=1
        break
      fi
      rm -f "$MODEL_PATH.part"
      echo "[WARN] LLM model download failed (attempt $attempt/$MAX_MODEL_DOWNLOAD_RETRIES)."
      if [ "$attempt" -lt "$MAX_MODEL_DOWNLOAD_RETRIES" ]; then
        sleep "$((attempt * 10))"
      fi
    done
    if [ "$downloaded" -ne 1 ]; then
      echo "[ERROR] LLM model download failed after $MAX_MODEL_DOWNLOAD_RETRIES attempts. The bundled LLM is unavailable for this container's lifetime; nothing retries the download later. Restart the container with a reachable LLM_MODEL_URL to try again."
      llm_status "error-download"
      return 0
    fi
  else
    echo "[INFO] LLM model found at $MODEL_PATH."
  fi

  echo "[INFO] Starting llama-server (port $LLM_PORT, context $LLM_CONTEXT, threads $LLM_THREADS)..."
  llm_status "starting"
  LD_LIBRARY_PATH=/usr/local/lib/llama \
    /usr/local/lib/llama/llama-server -m "$MODEL_PATH" -c "$LLM_CONTEXT" -t "$LLM_THREADS" \
    --host 127.0.0.1 --port "$LLM_PORT" >"$DATA_DIR/llama-server.log" 2>&1 &

  i=0
  while [ "$i" -lt "$LLM_TIMEOUT" ]; do
    if curl -sf "http://127.0.0.1:$LLM_PORT/health" >/dev/null 2>&1; then
      echo "[INFO] llama-server is healthy."
      llm_status "ready"
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "[WARN] llama-server did not become healthy within ${LLM_TIMEOUT}s. The memory compressor will retry the endpoint every tick; the status is refreshed once it responds."
  llm_status "error-start"
  return 0
}

mkdir -p "$DATA_DIR"

if check_api_key; then
  echo "[INFO] API_KEY ready. Starting server..."
  start_llm &
  exec node server.mjs
fi

echo "[FATAL] Unexpected API_KEY check failure."
llm_status "fatal"
exit 1