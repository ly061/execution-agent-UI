#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${PROJECT_DIR}/.local-deploy"
PID_FILE="${STATE_DIR}/server.pid"
LOG_FILE="${STATE_DIR}/server.log"
DEPLOY_HOST="${DEPLOY_HOST:-0.0.0.0}"
DEPLOY_PORT="${DEPLOY_PORT:-4173}"
COMMAND="${1:-start}"

is_running() {
  [[ -f "${PID_FILE}" ]] && kill -0 "$(<"${PID_FILE}")" 2>/dev/null
}

stop_server() {
  if ! is_running; then
    rm -f "${PID_FILE}"
    echo "QA Orbit local deployment is not running."
    return
  fi

  local server_pid
  server_pid="$(<"${PID_FILE}")"
  kill "${server_pid}"

  for _ in {1..20}; do
    if ! kill -0 "${server_pid}" 2>/dev/null; then
      rm -f "${PID_FILE}"
      echo "QA Orbit local deployment stopped."
      return
    fi
    sleep 0.25
  done

  echo "Server did not stop cleanly. PID: ${server_pid}" >&2
  exit 1
}

start_server() {
  if is_running; then
    echo "QA Orbit is already running with PID $(<"${PID_FILE}")."
    echo "Open http://localhost:${DEPLOY_PORT}/"
    return
  fi

  command -v node >/dev/null 2>&1 || { echo "Node.js is required." >&2; exit 1; }
  command -v npm >/dev/null 2>&1 || { echo "npm is required." >&2; exit 1; }

  mkdir -p "${STATE_DIR}"
  cd "${PROJECT_DIR}"

  echo "Installing locked dependencies..."
  npm ci

  echo "Building QA Orbit..."
  npm run build

  echo "Starting local production server on ${DEPLOY_HOST}:${DEPLOY_PORT}..."
  nohup node node_modules/vite/bin/vite.js preview --host "${DEPLOY_HOST}" --port "${DEPLOY_PORT}" --strictPort >"${LOG_FILE}" 2>&1 &
  local server_pid=$!
  echo "${server_pid}" >"${PID_FILE}"

  for _ in {1..30}; do
    if curl --silent --fail "http://127.0.0.1:${DEPLOY_PORT}/" >/dev/null 2>&1; then
      echo "QA Orbit deployed successfully."
      echo "Open http://localhost:${DEPLOY_PORT}/"
      echo "PID: ${server_pid}"
      echo "Log: ${LOG_FILE}"
      return
    fi
    if ! kill -0 "${server_pid}" 2>/dev/null; then
      break
    fi
    sleep 0.5
  done

  rm -f "${PID_FILE}"
  echo "Local deployment failed. Recent log output:" >&2
  tail -20 "${LOG_FILE}" >&2 || true
  exit 1
}

case "${COMMAND}" in
  start)
    start_server
    ;;
  stop)
    stop_server
    ;;
  restart)
    stop_server
    start_server
    ;;
  status)
    if is_running; then
      echo "QA Orbit is running with PID $(<"${PID_FILE}")."
      echo "Open http://localhost:${DEPLOY_PORT}/"
    else
      echo "QA Orbit local deployment is not running."
      exit 1
    fi
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}" >&2
    exit 2
    ;;
esac
