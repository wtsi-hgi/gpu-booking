# gpu-booking

GPU Booking is a full-stack scheduling application for shared accelerator infrastructure.

- Frontend: Next.js App Router (TypeScript, Server Actions, Tailwind/shadcn)
- Backend: FastAPI + SQLAlchemy
- Scope: request/track bookings, review capacity, and administer reference data

## What the app does

### User workflows
- Create a booking with GPU type, memory/GRAM options, workflow type, and dates.
- See booking status (`unconfirmed`, `confirmed`, `tentative`, `spot`, `rejected`, `cancelled`).
- View bookings in table/calendar-oriented screens.
- Validate requested allocations against capacity rules before submit.

### Admin workflows
- Manage reference data:
  - GPU types
  - workflow types
  - memory options
  - GRAM options
- Review and update bookings, including status and admin notes.
- Inspect capacity and guardrails for over-allocation.

## Repository layout

- `frontend/`: Next.js application and Vitest suite.
- `backend/`: FastAPI application, SQLAlchemy models/services, pytest suite.
- `run-dev.sh`: one-command local dev startup with health checks.

## Quick start (development)

Prerequisites:
- Node.js 20+
- pnpm
- Python 3.11+

From repo root:

```bash
# Frontend dependencies
cd frontend
pnpm install
cd ..

# Backend virtual environment + dependencies
python3 -m venv backend/.venv
backend/.venv/bin/pip install --upgrade pip
backend/.venv/bin/pip install -r backend/requirements-dev.txt
```

Start both services:

```bash
./run-dev.sh
```

Custom ports:

```bash
./run-dev.sh -f 4000 -b 9000
```

Logs:

```bash
tail -F logs/frontend.log logs/backend.log
```

Important:
- `run-dev.sh` launches backend via `backend/run_uvicorn.sh`, which uses `backend/.venv`.
- Installing deps into a different venv (for example repo-root `.venv`) will not satisfy backend runtime dependencies.

## Environment variables

The app runs with defaults, but these are commonly set:

- `FRONTEND_PORT` (default `3000`)
- `BACKEND_PORT` (default `8000`)
- `BACKEND_URL` (optional override used by frontend server-side calls)
- backend auth and app settings from `backend/.env.example`

## Running tests and checks

Frontend (`frontend/`):

```bash
pnpm lint
pnpm test
```

Backend (`backend/`):

```bash
.venv/bin/pytest
.venv/bin/ruff check .
```

Notes:
- Frontend tests are Vitest-based and include route/component/action contract coverage.
- A server-action export contract test now guards against invalid `use server` exports.
- A homepage smoke test verifies the root page renders with successful backend responses.

## Production essentials

### Frontend

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

### Backend

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install --upgrade pip
backend/.venv/bin/pip install -r backend/requirements.txt
backend/.venv/bin/uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8000
```

Use a process manager/container platform and external reverse proxy/load balancer as appropriate for your environment.

## Health endpoints

- Backend health: `GET /api/v1/health`
- Frontend health proxy: `GET /api/health`

`run-dev.sh` waits for both and performs a warmup request against `/` before declaring startup ready.
