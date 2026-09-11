#!/bin/sh
# shellcheck disable=SC3045

DATA_DIR="${DATA_DIR:-/app/data}"
MAX_MODEL_DOWNLOAD_RETRIES="${LLM_RETRIES:-3}"
LLM_TIMEOUT="${LLM_TIMEOUT:-120}"
PORT="${PORT:-3000}"
APP_HOST="${APP_HOST:-127.0.0.1}"
APP_PORT="${APP_PORT:-3001}"
NGINX_DEBUG="${NGINX_DEBUG:-false}"

llm_status() {
  echo "$1" >"$DATA_DIR/llm.status"
}

resolve_data_path() {
  case "$1" in
    /*|"") printf '%s' "$1" ;;
    *) printf '%s/%s' "$DATA_DIR" "$1" ;;
  esac
}

write_nginx_config() {
  # $1 = 1 when TLS should be enabled, 0 for plain HTTP
  NGINX_CONFIG=/etc/nginx/nginx.conf
  TLS_CERT="$(resolve_data_path "${SSL_CERT_FILE:-cert.pem}")"
  TLS_KEY="$(resolve_data_path "${SSL_KEY_FILE:-key.pem}")"
  if [ "$1" = "1" ]; then
    LISTEN_LINE="listen 0.0.0.0:$PORT ssl;"
    TLS_BLOCK="ssl_certificate $TLS_CERT;
    ssl_certificate_key $TLS_KEY;
    ssl_protocols TLSv1.2 TLSv1.3;"
  else
    LISTEN_LINE="listen 0.0.0.0:$PORT;"
    TLS_BLOCK=""
  fi
  if [ "$NGINX_DEBUG" = "true" ]; then
    ACCESS_LOG="access_log /dev/stdout;"
  else
    ACCESS_LOG="access_log $DATA_DIR/nginx-access.log;"
  fi
  cat >"$NGINX_CONFIG" <<EOF
worker_processes 1;
events {
  worker_connections 1024;
}
http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  sendfile on;
  $ACCESS_LOG
  error_log /dev/stderr warn;
  proxy_http_version 1.1;
  proxy_buffering off;
  proxy_read_timeout 3600s;
  proxy_send_timeout 3600s;
  proxy_request_buffering off;
  server {
    $LISTEN_LINE
    $TLS_BLOCK
    client_max_body_size 64m;
    location / {
      proxy_pass http://$APP_HOST:$APP_PORT;
      proxy_set_header Host \$host;
      proxy_set_header X-Real-IP \$remote_addr;
      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto \$scheme;
    }
  }
}
EOF
}

start_nginx() {
  write_nginx_config 0
  CERT="$(resolve_data_path "${SSL_CERT_FILE:-cert.pem}")"
  KEY="$(resolve_data_path "${SSL_KEY_FILE:-key.pem}")"
  if [ -s "$CERT" ] && [ -s "$KEY" ]; then
    write_nginx_config 1
    if nginx -t >/dev/null 2>&1; then
      echo "[INFO] nginx serving TLS on port $PORT ($CERT)."
      nginx -g 'daemon off;' &
      return 0
    fi
    echo "[WARN] TLS certificate or key in $DATA_DIR is invalid; falling back to plain HTTP on port $PORT."
    write_nginx_config 0
  else
    echo "[INFO] No TLS certificate found; nginx serving plain HTTP on port $PORT."
    if [ ! -e "$CERT" ] && [ ! -e "$KEY" ]; then
      echo "[INFO] Drop cert.pem and key.pem into $DATA_DIR and restart to enable HTTPS."
    fi
  fi
  nginx -g 'daemon off;' &
  return 0
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
    stdbuf -oL -eL /usr/local/lib/llama/llama-server -m "$MODEL_PATH" -c "$LLM_CONTEXT" -t "$LLM_THREADS" \
    --host 127.0.0.1 --port "$LLM_PORT" >"$DATA_DIR/llama-server.log" 2>&1 &
  LLAMA_PID=$!

  i=0
  while [ "$i" -lt "$LLM_TIMEOUT" ]; do
    if curl -sf "http://127.0.0.1:$LLM_PORT/health" >/dev/null 2>&1; then
      echo "[INFO] llama-server is healthy."
      llm_status "ready"
      return 0
    fi
    if ! kill -0 "$LLAMA_PID" 2>/dev/null; then
      wait "$LLAMA_PID" 2>/dev/null
      LLAMA_EXIT=$?
      echo "[ERROR] llama-server exited before becoming healthy (exit code $LLAMA_EXIT). Dumping its log:"
      if [ -s "$DATA_DIR/llama-server.log" ]; then
        tail -50 "$DATA_DIR/llama-server.log"
      else
        echo "[ERROR] $DATA_DIR/llama-server.log is empty - the process produced no output before exiting."
      fi
      llm_status "error-start"
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "[WARN] llama-server did not become healthy within ${LLM_TIMEOUT}s but is still running. The memory compressor will retry the endpoint every tick; the status is refreshed once it responds."
  llm_status "error-start"
  return 0
}

mkdir -p "$DATA_DIR"

if check_api_key; then
  echo "[INFO] API_KEY ready. Starting server..."
  start_nginx
  start_llm &
  exec node server.mjs
fi

echo "[FATAL] Unexpected API_KEY check failure."
llm_status "fatal"
exit 1