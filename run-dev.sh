#!/usr/bin/env bash
# Start frontend and backend dev servers and stop them cleanly on exit.
set -euo pipefail

usage() {
  cat <<-EOF
Usage: $0 [--frontend-port PORT] [--backend-port PORT]

Starts frontend and backend in development mode.

Options:
  -f, --frontend-port PORT   Port for frontend dev server (default: 3000)
  -b, --backend-port PORT    Port for backend uvicorn server (default: 8000)

Port precedence: these options, then GPU_BOOKING_FRONTEND_PORT /
GPU_BOOKING_BACKEND_PORT in the environment, then the same keys in the
repo-root .env, then the defaults.
  -h, --help                 Show this help

Examples:
  # start frontend on 3000 and backend on 8000
  $0

  # custom ports
  $0 --frontend-port 4000 --backend-port 9000

Set GPU_BOOKING_TLS_CERT and GPU_BOOKING_TLS_KEY (both or neither) to serve
the frontend over HTTPS with that certificate; see README "HTTPS".

Logs are written to ./logs/frontend.log and ./logs/backend.log
`make run` loads every repo-root .env value; run directly, this script only
reads the two port keys from it.
EOF
}

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# Print the last value of KEY in the repo-root .env, without evaluating the file.
dotenv_value() {
  local key="$1"
  local file="${SCRIPT_DIR}/.env"
  [[ -f "$file" ]] || return 0
  sed -n -E "s/^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=[[:space:]]*(.*)$/\2/p" "$file" |
    tail -n 1 | tr -d '\r' | sed -E 's/[[:space:]]+$//'
}

FRONTEND_PORT=${GPU_BOOKING_FRONTEND_PORT:-${FRONTEND_PORT:-$(dotenv_value GPU_BOOKING_FRONTEND_PORT)}}
BACKEND_PORT=${GPU_BOOKING_BACKEND_PORT:-${BACKEND_PORT:-$(dotenv_value GPU_BOOKING_BACKEND_PORT)}}
FRONTEND_PORT=${FRONTEND_PORT:-3000}
BACKEND_PORT=${BACKEND_PORT:-8000}
FRONT_PID=""
BACK_PID=""
FRONT_KILL_MODE="pid"
BACK_KILL_MODE="pid"

kill_process_tree() {
  local pid="$1"
  if [[ -z "$pid" ]]; then
    return 0
  fi

  # Terminate children first so dev-server wrappers do not leave orphan processes.
  if command -v pgrep >/dev/null 2>&1; then
    local child
    while IFS= read -r child; do
      kill_process_tree "$child"
    done < <(pgrep -P "$pid" 2>/dev/null || true)
  fi

  kill -TERM "$pid" 2>/dev/null || true
}

cleanup() {
  echo "Stopping services..."
  # Prefer group termination when available, otherwise terminate process trees.
  if [[ -n "${FRONT_PID:-}" ]]; then
    echo "Killing frontend group (PID ${FRONT_PID})"
    if [[ "${FRONT_KILL_MODE}" == "group" ]]; then
      kill -TERM -"${FRONT_PID}" 2>/dev/null || kill -TERM "${FRONT_PID}" 2>/dev/null || true
    else
      kill_process_tree "${FRONT_PID}"
    fi
  fi
  if [[ -n "${BACK_PID:-}" ]]; then
    echo "Killing backend group (PID ${BACK_PID})"
    if [[ "${BACK_KILL_MODE}" == "group" ]]; then
      kill -TERM -"${BACK_PID}" 2>/dev/null || kill -TERM "${BACK_PID}" 2>/dev/null || true
    else
      kill_process_tree "${BACK_PID}"
    fi
  fi
  # wait for processes to exit
  wait 2>/dev/null || true
  echo "Stopped."
}

trap 'cleanup; exit' INT TERM EXIT

while [[ ${#} -gt 0 ]]; do
  case "$1" in
    -f|--frontend-port)
      FRONTEND_PORT=${2:-}
      shift 2
      ;;
    -b|--backend-port)
      BACKEND_PORT=${2:-}
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

TLS_CERT=${GPU_BOOKING_TLS_CERT:-}
TLS_KEY=${GPU_BOOKING_TLS_KEY:-}
FRONTEND_SCHEME="http"
FRONTEND_HOST="localhost"
FRONTEND_CURL_ARGS=()

absolute_path() {
  local path="$1"
  (cd "$(dirname "$path")" && printf '%s/%s\n' "$(pwd)" "$(basename "$path")")
}

for port_var in FRONTEND_PORT BACKEND_PORT; do
  if [[ ! "${!port_var}" =~ ^[0-9]+$ ]]; then
    echo "Error: ${port_var} must be a port number, got: ${!port_var}" >&2
    exit 1
  fi
done

if [[ -n "$TLS_CERT" || -n "$TLS_KEY" ]]; then
  # Same checks pnpm dev makes (pair set, readable, parsable, matching,
  # unexpired), run before anything starts so mistakes fail fast.
  if ! command -v node >/dev/null 2>&1; then
    echo "Error: node is required to check GPU_BOOKING_TLS_CERT/GPU_BOOKING_TLS_KEY" >&2
    exit 1
  fi
  node "${SCRIPT_DIR}/frontend/scripts/dev-tls.mjs" || exit 1
  # The frontend runs from frontend/, so relative paths must be made absolute.
  TLS_CERT=$(absolute_path "$TLS_CERT")
  TLS_KEY=$(absolute_path "$TLS_KEY")
  FRONTEND_SCHEME="https"
  # The certificate names this host, not localhost, so check it by that name
  # while still connecting locally.
  FRONTEND_HOST=$(hostname -f 2>/dev/null || hostname)
  FRONTEND_CURL_ARGS=(--cacert "$TLS_CERT" --resolve "${FRONTEND_HOST}:${FRONTEND_PORT}:127.0.0.1")
fi

FRONTEND_ENV="GPU_BOOKING_FRONTEND_PORT=${FRONTEND_PORT} FRONTEND_PORT=${FRONTEND_PORT} GPU_BOOKING_BACKEND_PORT=${BACKEND_PORT} BACKEND_PORT=${BACKEND_PORT} GPU_BOOKING_BACKEND_URL=http://127.0.0.1:${BACKEND_PORT} BACKEND_URL=http://127.0.0.1:${BACKEND_PORT} GPU_BOOKING_TLS_CERT=$(printf '%q' "$TLS_CERT") GPU_BOOKING_TLS_KEY=$(printf '%q' "$TLS_KEY")"
FRONTEND_URL="${FRONTEND_SCHEME}://${FRONTEND_HOST}:${FRONTEND_PORT}"

echo "Starting local development services..."

mkdir -p logs

echo "Starting backend on port ${BACKEND_PORT} (logs: logs/backend.log)"
# Use setsid when available so the command runs in its own process group.
if command -v setsid >/dev/null 2>&1; then
  setsid bash -lc "cd backend && GPU_BOOKING_BACKEND_PORT=${BACKEND_PORT} BACKEND_PORT=${BACKEND_PORT} ./run_uvicorn.sh" > logs/backend.log 2>&1 &
  BACK_KILL_MODE="group"
else
  bash -lc "cd backend && GPU_BOOKING_BACKEND_PORT=${BACKEND_PORT} BACKEND_PORT=${BACKEND_PORT} exec ./run_uvicorn.sh" > logs/backend.log 2>&1 &
  BACK_KILL_MODE="pid"
fi
BACK_PID=$!

echo "Starting frontend on ${FRONTEND_URL} (logs: logs/frontend.log)"
if command -v setsid >/dev/null 2>&1; then
  setsid bash -lc "cd frontend && ${FRONTEND_ENV} pnpm dev" > logs/frontend.log 2>&1 &
  FRONT_KILL_MODE="group"
else
  bash -lc "cd frontend && ${FRONTEND_ENV} exec pnpm dev" > logs/frontend.log 2>&1 &
  FRONT_KILL_MODE="pid"
fi
FRONT_PID=$!

echo "Frontend PID: ${FRONT_PID}, Backend PID: ${BACK_PID}"

# Wait for services to be ready
if command -v curl >/dev/null; then
    show_log_tail() {
        local log="$1"
        [[ -f "$log" ]] || return 0
        echo "Last 20 lines of ${log}:"
        tail -n 20 "$log" | sed 's/^/  /'
    }

    wait_for_url() {
        local url="$1"
        local name="$2"
    local pid="${3:-}"
    local log="${4:-}"
    shift 4
    # Remaining arguments are extra curl options (e.g. TLS trust settings).
        local max_attempts=60
        local attempt=1

        echo -n "Waiting for $name to be ready at $url..."
        while [ $attempt -le $max_attempts ]; do
      if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
        echo " Failed! $name process exited early (PID $pid)."
        show_log_tail "$log"
        return 1
      fi
            if curl -s -o /dev/null -w "%{http_code}" "$@" "$url" | grep -q "200"; then
                echo " Ready!"
                return 0
            fi
            echo -n "."
            sleep 1
            attempt=$((attempt + 1))
        done
        echo " Timeout!"
        show_log_tail "$log"
        return 1
    }

    wait_for_url "http://localhost:${BACKEND_PORT}/api/v1/health" "Backend" "${BACK_PID}" logs/backend.log
    wait_for_url "${FRONTEND_URL}/api/health" "Frontend" "${FRONT_PID}" logs/frontend.log ${FRONTEND_CURL_ARGS[@]+"${FRONTEND_CURL_ARGS[@]}"}
    # Warm up the main page so the first browser visit is fast
    wait_for_url "${FRONTEND_URL}/" "Frontend (Warmup)" "${FRONT_PID}" logs/frontend.log ${FRONTEND_CURL_ARGS[@]+"${FRONTEND_CURL_ARGS[@]}"}
else
    echo "curl not found, skipping health checks."
fi

echo "Frontend URL: ${FRONTEND_URL}/"
echo "Tail logs with: tail -F logs/frontend.log logs/backend.log"

# Wait until signals are received; sleep in a loop so trap can fire.
while true; do
  sleep 1
done
