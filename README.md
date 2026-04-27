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
- `Makefile`: repo-level lint, format, test, and run entrypoints.
- `run-dev.sh`: thin local runtime launcher with health checks.

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

Run repo checks:

```bash
make lint
make test
```

Apply formatting:

```bash
make format
```

Start both services:

```bash
make run
```

To keep local overrides out of your shell, put them in a repo-root `.env` file.
`make` automatically loads that file before `run`, `test`, `lint`, and `format`.

Example `.env`:

```bash
GPU_BOOKING_FRONTEND_PORT=4000
GPU_BOOKING_BACKEND_PORT=9000
GPU_BOOKING_AUTH_MODE=insecure
```

Custom ports:

```bash
make run GPU_BOOKING_FRONTEND_PORT=4000 GPU_BOOKING_BACKEND_PORT=9000
```

Logs:

```bash
tail -F logs/frontend.log logs/backend.log
```

Important:
- `make run` is a thin wrapper around `./run-dev.sh`.
- `run-dev.sh` only starts, health-checks, and stops the frontend/backend processes cleanly.
- `run-dev.sh` sets `GPU_BOOKING_BACKEND_URL` for the frontend process so custom backend ports override frontend-local `.env` defaults during dev startup.
- `run-dev.sh` launches backend via `backend/run_uvicorn.sh`, which uses `backend/.venv`.
- Installing deps into a different venv (for example repo-root `.venv`) will not satisfy backend runtime dependencies.

## Environment variables

The app runs with defaults, but these are commonly set:

- `GPU_BOOKING_FRONTEND_PORT` (default `3000`)
- `GPU_BOOKING_BACKEND_PORT` (default `8000`)
- `GPU_BOOKING_BACKEND_URL` (optional override used by frontend server-side calls)
- `GPU_BOOKING_AUTH_MODE` (`insecure` by default, `oidc` in production)
- `GPU_BOOKING_DATABASE_URL`
- `GPU_BOOKING_INITIAL_ADMIN_EMAILS`
- backend auth and app settings from `backend/.env.example`

Historical unprefixed names such as `FRONTEND_PORT`, `BACKEND_PORT`, `BACKEND_URL`,
`AUTH_MODE`, and `DATABASE_URL` are still accepted as compatibility aliases, but
new configuration should use the `GPU_BOOKING_` names.

### Authentication mode (important)

Backend auth mode is controlled by `GPU_BOOKING_AUTH_MODE`.

- Default when unset: `insecure`
- Production recommendation: `oidc`

When running with `GPU_BOOKING_AUTH_MODE=insecure`:

- The app enables developer impersonation (`Switch User`) in the UI.
- The backend accepts `X-Dev-User` and treats requests as that email.
- This mode is intended for local development only.

When running with `GPU_BOOKING_AUTH_MODE=oidc`:

- `Switch User` is hidden.
- The frontend root page becomes a sign-in landing page for unauthenticated users.
- Frontend server actions and server-rendered pages forward the OIDC bearer token to the backend.
- Backend ignores dev impersonation headers and requires bearer tokens.
- Admin access is based on authenticated user email membership in the admins table.

For production, explicitly set OIDC-related variables and do not rely on defaults.

Frontend OIDC settings:

- `GPU_BOOKING_OIDC_ISSUER_URL` or `GPU_BOOKING_OIDC_ISSUER`
- `GPU_BOOKING_OIDC_CLIENT_ID`
- `GPU_BOOKING_OIDC_CLIENT_SECRET`
- `GPU_BOOKING_OIDC_REDIRECT_URI` (optional)
- `GPU_BOOKING_OIDC_POST_LOGOUT_REDIRECT_URI` (optional)
- `GPU_BOOKING_OIDC_SCOPES` (optional, defaults to `openid profile email`)

Backend accepts both historical `OKTA_*`/`OIDC_*` names and corresponding `GPU_BOOKING_*` aliases for issuer, audience, and client settings.

## Running tests and checks

Repo root:

```bash
make lint
make format
make test
make run
```

Frontend (`frontend/`):

```bash
pnpm lint
pnpm format
pnpm test
pnpm test:e2e
```

Backend (`backend/`):

```bash
.venv/bin/pytest
.venv/bin/ruff check .
.venv/bin/ruff format .
```

Notes:
- Frontend tests are Vitest-based and include route/component/action contract coverage.
- Frontend Playwright E2E coverage starts the repo locally via `run-dev.sh` against an isolated SQLite database and uses the preinstalled Chromium/browser path from the environment.
- A server-action export contract test now guards against invalid `use server` exports.
- A homepage smoke test verifies the root page renders with successful backend responses.

## Production essentials

Before starting production services, set backend auth configuration (at minimum):

- `GPU_BOOKING_AUTH_MODE=oidc`
- `GPU_BOOKING_OIDC_ISSUER_URL` (or `GPU_BOOKING_OKTA_ISSUER`)
- `GPU_BOOKING_OIDC_AUDIENCE` (if your token validation requires audience checking)
- `GPU_BOOKING_INITIAL_ADMIN_EMAILS` (comma-separated bootstrap list used by seed/admin workflows)

Equivalent backend aliases are also accepted:

- `OIDC_ISSUER_URL` or `OIDC_ISSUER`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`
- `OIDC_AUDIENCE`

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

`make run` invokes `run-dev.sh`, which waits for both services and performs a warmup request against `/` before declaring startup ready.
