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

if check_api_key; then
  echo "[INFO] API_KEY is configured. Starting server..."
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
    exec node server.mjs
  fi
done

echo "[FATAL] Failed to start after $MAX_RETRIES attempts. API_KEY is required."
exit 1
