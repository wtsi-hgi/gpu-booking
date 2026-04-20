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
  -h, --help                 Show this help

Examples:
  # start frontend on 3000 and backend on 8000
  $0

  # custom ports
  $0 --frontend-port 4000 --backend-port 9000

Logs are written to ./logs/frontend.log and ./logs/backend.log
EOF
}

FRONTEND_PORT=3000
BACKEND_PORT=8000
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

echo "Starting local development services..."

mkdir -p logs

echo "Starting backend on port ${BACKEND_PORT} (logs: logs/backend.log)"
# Use setsid when available so the command runs in its own process group.
if command -v setsid >/dev/null 2>&1; then
  setsid bash -lc "cd backend && BACKEND_PORT=${BACKEND_PORT} ./run_uvicorn.sh" > logs/backend.log 2>&1 &
  BACK_KILL_MODE="group"
else
  bash -lc "cd backend && BACKEND_PORT=${BACKEND_PORT} exec ./run_uvicorn.sh" > logs/backend.log 2>&1 &
  BACK_KILL_MODE="pid"
fi
BACK_PID=$!

echo "Starting frontend on port ${FRONTEND_PORT} (logs: logs/frontend.log)"
if command -v setsid >/dev/null 2>&1; then
  setsid bash -lc "cd frontend && FRONTEND_PORT=${FRONTEND_PORT} BACKEND_PORT=${BACKEND_PORT} BACKEND_URL=http://127.0.0.1:${BACKEND_PORT} pnpm dev" > logs/frontend.log 2>&1 &
  FRONT_KILL_MODE="group"
else
  bash -lc "cd frontend && FRONTEND_PORT=${FRONTEND_PORT} BACKEND_PORT=${BACKEND_PORT} BACKEND_URL=http://127.0.0.1:${BACKEND_PORT} exec pnpm dev" > logs/frontend.log 2>&1 &
  FRONT_KILL_MODE="pid"
fi
FRONT_PID=$!

echo "Frontend PID: ${FRONT_PID}, Backend PID: ${BACK_PID}"

# Wait for services to be ready
if command -v curl >/dev/null; then
    wait_for_url() {
        local url="$1"
        local name="$2"
    local pid="${3:-}"
        local max_attempts=60
        local attempt=1

        echo -n "Waiting for $name to be ready at $url..."
        while [ $attempt -le $max_attempts ]; do
      if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
        echo " Failed! $name process exited early (PID $pid)."
        return 1
      fi
            if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200"; then
                echo " Ready!"
                return 0
            fi
            echo -n "."
            sleep 1
            attempt=$((attempt + 1))
        done
        echo " Timeout!"
        return 1
    }

    wait_for_url "http://localhost:${BACKEND_PORT}/api/v1/health" "Backend" "${BACK_PID}"
    wait_for_url "http://localhost:${FRONTEND_PORT}/api/health" "Frontend" "${FRONT_PID}"
    # Warm up the main page so the first browser visit is fast
    wait_for_url "http://localhost:${FRONTEND_PORT}/" "Frontend (Warmup)" "${FRONT_PID}"
else
    echo "curl not found, skipping health checks."
fi

echo "Tail logs with: tail -F logs/frontend.log logs/backend.log"

# Wait until signals are received; sleep in a loop so trap can fire.
while true; do
  sleep 1
done
