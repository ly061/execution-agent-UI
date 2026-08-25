#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${PROJECT_DIR}/.local-deploy"
VENV_DIR="${STATE_DIR}/venv"

FRONTEND_PID_FILE="${STATE_DIR}/frontend.pid"
FRONTEND_LOG_FILE="${STATE_DIR}/frontend.log"
BACKEND_PID_FILE="${STATE_DIR}/backend.pid"
BACKEND_LOG_FILE="${STATE_DIR}/backend.log"

FRONTEND_HOST="${FRONTEND_HOST:-0.0.0.0}"
FRONTEND_PORT="${FRONTEND_PORT:-${DEPLOY_PORT:-4173}}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
COMMAND="${1:-start}"

frontend_url="http://127.0.0.1:${FRONTEND_PORT}/"
backend_health_url="http://${BACKEND_HOST}:${BACKEND_PORT}/api/health"

pid_is_running() {
  local pid_file="$1"
  [[ -f "${pid_file}" ]] && kill -0 "$(<"${pid_file}")" 2>/dev/null
}

url_is_ready() {
  curl --silent --show-error --fail --max-time 2 "$1" >/dev/null 2>&1
}

wait_for_url() {
  local name="$1"
  local url="$2"
  local pid_file="$3"
  local log_file="$4"

  for _ in {1..60}; do
    if url_is_ready "${url}"; then
      return 0
    fi
    if ! pid_is_running "${pid_file}"; then
      echo "${name} failed to start. Recent log output:" >&2
      tail -30 "${log_file}" >&2 || true
      return 1
    fi
    sleep 0.5
  done

  echo "Timed out waiting for ${name} at ${url}." >&2
  tail -30 "${log_file}" >&2 || true
  return 1
}

stop_process() {
  local name="$1"
  local pid_file="$2"

  if ! pid_is_running "${pid_file}"; then
    rm -f "${pid_file}"
    return 0
  fi

  local pid
  pid="$(<"${pid_file}")"
  kill "${pid}"

  for _ in {1..20}; do
    if ! kill -0 "${pid}" 2>/dev/null; then
      rm -f "${pid_file}"
      echo "Stopped ${name}."
      return 0
    fi
    sleep 0.25
  done

  echo "${name} did not stop gracefully; forcing it to stop (PID ${pid})." >&2
  kill -KILL "${pid}" 2>/dev/null || true

  for _ in {1..20}; do
    if ! kill -0 "${pid}" 2>/dev/null; then
      rm -f "${pid_file}"
      echo "Stopped ${name}."
      return 0
    fi
    sleep 0.25
  done

  echo "Unable to stop ${name} (PID ${pid})." >&2
  return 1
}

stop_services() {
  local failed=0
  stop_process "frontend" "${FRONTEND_PID_FILE}" || failed=1
  stop_process "backend" "${BACKEND_PID_FILE}" || failed=1
  rm -f "${STATE_DIR}/server.pid" "${STATE_DIR}/agent.pid"

  if [[ "${failed}" -ne 0 ]]; then
    return 1
  fi
  echo "QA Orbit local deployment is stopped."
}

check_port_is_free() {
  local name="$1"
  local port="$2"
  if lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Cannot start ${name}: port ${port} is already in use." >&2
    lsof -nP -iTCP:"${port}" -sTCP:LISTEN >&2 || true
    return 1
  fi
}

ensure_dependencies() {
  command -v node >/dev/null 2>&1 || { echo "Node.js is required." >&2; exit 1; }
  command -v npm >/dev/null 2>&1 || { echo "npm is required." >&2; exit 1; }
  command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 1; }
  command -v lsof >/dev/null 2>&1 || { echo "lsof is required." >&2; exit 1; }

  mkdir -p "${STATE_DIR}"

  # Prefer an existing compatible project environment before the system Python.
  if [[ -x "${PROJECT_DIR}/.venv/bin/python" ]] \
    && "${PROJECT_DIR}/.venv/bin/python" -c 'import sys; raise SystemExit(sys.version_info < (3, 11))'; then
    VENV_DIR="${PROJECT_DIR}/.venv"
  elif [[ ! -x "${VENV_DIR}/bin/python" ]] \
    || ! "${VENV_DIR}/bin/python" -c 'import sys; raise SystemExit(sys.version_info < (3, 11))'; then
    local python_command=""
    local candidate
    for candidate in python3.13 python3.12 python3.11 python3; do
      if command -v "${candidate}" >/dev/null 2>&1 \
        && "${candidate}" -c 'import sys; raise SystemExit(sys.version_info < (3, 11))'; then
        python_command="${candidate}"
        break
      fi
    done
    if [[ -z "${python_command}" ]]; then
      echo "Python 3.11 or newer is required." >&2
      exit 1
    fi

    echo "Creating Python virtual environment..."
    "${python_command}" -m venv "${VENV_DIR}"
  fi

  echo "Installing backend dependencies..."
  "${VENV_DIR}/bin/pip" install --quiet -r "${PROJECT_DIR}/backend/requirements.txt"

  echo "Installing frontend dependencies..."
  (cd "${PROJECT_DIR}" && npm ci)
}

start_services() {
  # Clear stale PID files left by an interrupted terminal session.
  rm -f "${FRONTEND_PID_FILE}" "${BACKEND_PID_FILE}" \
    "${STATE_DIR}/server.pid" "${STATE_DIR}/agent.pid"

  check_port_is_free "frontend" "${FRONTEND_PORT}"
  check_port_is_free "backend" "${BACKEND_PORT}"
  ensure_dependencies

  echo "Building frontend..."
  (cd "${PROJECT_DIR}" && npm run build)

  local startup_complete=false
  cleanup_failed_start() {
    if [[ "${startup_complete}" != true ]]; then
      echo "Startup failed; cleaning up local services..." >&2
      stop_process "frontend" "${FRONTEND_PID_FILE}" || true
      stop_process "backend" "${BACKEND_PID_FILE}" || true
    fi
  }
  trap cleanup_failed_start EXIT

  echo "Starting backend at http://${BACKEND_HOST}:${BACKEND_PORT}/ ..."
  (
    cd "${PROJECT_DIR}"
    PYTHONPATH=backend nohup "${VENV_DIR}/bin/uvicorn" app.main:app \
      --host "${BACKEND_HOST}" --port "${BACKEND_PORT}" \
      >"${BACKEND_LOG_FILE}" 2>&1 &
    echo "$!" >"${BACKEND_PID_FILE}"
  )
  wait_for_url "backend" "${backend_health_url}" "${BACKEND_PID_FILE}" "${BACKEND_LOG_FILE}"

  echo "Starting frontend at http://localhost:${FRONTEND_PORT}/ ..."
  (
    cd "${PROJECT_DIR}"
    nohup node node_modules/vite/bin/vite.js preview \
      --host "${FRONTEND_HOST}" --port "${FRONTEND_PORT}" --strictPort \
      >"${FRONTEND_LOG_FILE}" 2>&1 &
    echo "$!" >"${FRONTEND_PID_FILE}"
  )
  wait_for_url "frontend" "${frontend_url}" "${FRONTEND_PID_FILE}" "${FRONTEND_LOG_FILE}"

  startup_complete=true
  trap - EXIT
  echo "QA Orbit deployed successfully."
  print_status
}

deploy_services() {
  echo "Stopping the existing local deployment (if any)..."
  stop_services

  echo "Deploying the latest local build..."
  start_services
}

print_status() {
  local frontend_state="stopped"
  local backend_state="stopped"

  if pid_is_running "${FRONTEND_PID_FILE}" && url_is_ready "${frontend_url}"; then
    frontend_state="running (PID $(<"${FRONTEND_PID_FILE}"))"
  fi
  if pid_is_running "${BACKEND_PID_FILE}" && url_is_ready "${backend_health_url}"; then
    backend_state="running (PID $(<"${BACKEND_PID_FILE}"))"
  fi

  echo "Frontend: ${frontend_state} — http://localhost:${FRONTEND_PORT}/"
  echo "Backend:  ${backend_state} — http://${BACKEND_HOST}:${BACKEND_PORT}/"
  echo "Logs:     ${STATE_DIR}"

  [[ "${frontend_state}" == running* && "${backend_state}" == running* ]]
}

show_logs() {
  mkdir -p "${STATE_DIR}"
  touch "${FRONTEND_LOG_FILE}" "${BACKEND_LOG_FILE}"
  tail -n 50 -f "${FRONTEND_LOG_FILE}" "${BACKEND_LOG_FILE}"
}

case "${COMMAND}" in
  start)
    deploy_services
    ;;
  stop)
    stop_services
    ;;
  restart)
    deploy_services
    ;;
  status)
    print_status
    ;;
  logs)
    show_logs
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs}" >&2
    exit 2
    ;;
esac
