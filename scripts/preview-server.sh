#!/bin/bash
# Dev helper: run a local s19y-mcp preview server on port 3003 with
# scratch data under tmp/, so browser UI and API changes can be
# reviewed without touching the real store.
#
# The server runs as a background process tracked by a pidfile inside
# tmp/, so no process listing is needed to manage it.
#
# Usage: scripts/preview-server.sh {start|stop|restart|status|verify}
#   (default: restart)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${ROOT}/tmp/preview-server.pid"
LOG_FILE="${ROOT}/tmp/preview.log"
DATA_DIR="${ROOT}/tmp/preview-data"
COOKIE_FILE="${ROOT}/tmp/s19y-cookies.txt"
PORT="${PREVIEW_PORT:-3003}"
BASE_URL="http://127.0.0.1:${PORT}/browser.app/api/status"

mkdir -p "${ROOT}/tmp"

is_running() {
  [ -f "${PID_FILE}" ] || return 1
  local pid
  pid="$(cat "${PID_FILE}")"
  [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null
}

start() {
  if is_running; then
    echo "Preview server already running (pid $(cat "${PID_FILE}"))"
    return 0
  fi
  local port
  port="${PREVIEW_PORT:-3003}"
  echo "Starting preview server on http://127.0.0.1:${port}/browser.app/ ..."
  cd "${ROOT}"
  DATA_DIR="${DATA_DIR}" \
  PORT="${port}" \
  APP_PORT="${port}" \
  ADMIN_USER="preview" \
  ADMIN_PASSWORD="preview03" \
  COMPRESSION_ENDPOINT="none" \
  BROWSER_HOSTNAME="localhost" \
  BROWSER_SCHEME="http" \
  node --disable-warning=ExperimentalWarning server.mjs >> "${LOG_FILE}" 2>&1 &
  echo $! > "${PID_FILE}"
  for _ in {1..60}; do
    if curl -sf "${BASE_URL}" > /dev/null 2>&1; then
      echo "Preview server up (pid $(cat "${PID_FILE}"))"
      return 0
    fi
    sleep 1
  done
  echo "Preview server did not become ready; see ${LOG_FILE}" >&2
  return 1
}

stop() {
  if ! is_running; then
    echo "Preview server not running"
    rm -f "${PID_FILE}"
    return 0
  fi
  local pid
  pid="$(cat "${PID_FILE}")"
  echo "Stopping preview server (pid ${pid})"
  kill "${pid}" 2>/dev/null || true
  for _ in {1..20}; do
    if ! kill -0 "${pid}" 2>/dev/null; then
      break
    fi
    sleep 1
  done
  rm -f "${PID_FILE}"
  echo "Preview server stopped"
}

status() {
  if is_running; then
    echo "Preview server running (pid $(cat "${PID_FILE}"))"
  else
    echo "Preview server not running"
  fi
}

restart() {
  stop
  start
}

extract_api_key() {
  grep 'Generated API_KEY:' "${LOG_FILE}" 2>/dev/null | tail -1 | \
    sed 's/.*Generated API_KEY: \([^ ]*\).*/\1/' || true
}

verify() {
  if ! is_running; then
    echo "Preview server not running; run '$0 start' first." >&2
    return 1
  fi
  rm -f "${COOKIE_FILE}"
  local api_key
  api_key="$(extract_api_key)"

  echo "== Browser admin =="
  if curl -sf -c "${COOKIE_FILE}" -X POST \
       "http://127.0.0.1:${PORT}/browser.app/api/login/begin" \
       -H 'Content-Type: application/json' \
       -d '{"name":"preview","password":"preview03"}' > /dev/null 2>&1; then
    echo "Login: OK"
  else
    echo "Login: FAILED" >&2
    return 1
  fi
  echo "Page list:"
  curl -sf -b "${COOKIE_FILE}" \
    "http://127.0.0.1:${PORT}/browser.app/api/info" | \
    python3 -m json.tool 2>/dev/null || echo "(fetch failed)"
  echo
  echo "agents page (first 6 lines):"
  curl -sf -b "${COOKIE_FILE}" \
    "http://127.0.0.1:${PORT}/browser.app/api/info/agents" | head -6 || echo "(fetch failed)"
  echo

  echo "== Agent HTTP API (X-API-Key) =="
  if [ -n "${api_key}" ]; then
    echo "Page list:"
    curl -sf -H "X-API-Key: ${api_key}" \
      "http://127.0.0.1:${PORT}/info/" | \
      python3 -m json.tool 2>/dev/null || echo "(fetch failed)"
    echo
    echo "agents page (first 6 lines):"
    curl -sf -H "X-API-Key: ${api_key}" \
      "http://127.0.0.1:${PORT}/info/agents" | head -6 || echo "(fetch failed)"
  else
    echo "Could not read API key from ${LOG_FILE}; skipping."
  fi

  rm -f "${COOKIE_FILE}"
}

case "${1:-restart}" in
  start) start ;;
  stop) stop ;;
  restart) restart ;;
  status) status ;;
  verify) verify ;;
  *) echo "Usage: $0 {start|stop|restart|status|verify}" >&2; exit 2 ;;
esac