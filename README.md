# gpu-booking

GPU Booking is a full-stack scheduling application for shared accelerator infrastructure.

- Frontend: Next.js App Router (TypeScript, Server Actions, Tailwind/shadcn)
- Backend: FastAPI + SQLAlchemy
- Scope: request/track bookings, review capacity, and administer reference data

## What the app does

### User workflows
- Create a booking with GPU host type, host count, workflow type, and dates.
- See booking status (`unconfirmed`, `confirmed`, `tentative`, `spot`, `rejected`, `cancelled`).
- View bookings in table/calendar-oriented screens.
- Validate requested allocations against capacity rules before submit.

### Admin workflows
- Manage reference data:
  - GPU host types
  - workflow types
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
  If a service fails its health check, it prints the last 20 lines of that service's log.
- Run directly, `./run-dev.sh` reads only `GPU_BOOKING_FRONTEND_PORT` and
  `GPU_BOOKING_BACKEND_PORT` from the repo-root `.env`, so it uses the same ports as
  `make run`. Its `--frontend-port`/`--backend-port` flags, then those variables in
  the environment, take precedence over `.env`.
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
- `GPU_BOOKING_TLS_CERT` / `GPU_BOOKING_TLS_KEY` (optional; serve the dev frontend over HTTPS, see [HTTPS](#https))
- backend auth and app settings from `backend/.env.example`

Historical unprefixed names such as `FRONTEND_PORT`, `BACKEND_PORT`, `BACKEND_URL`,
`AUTH_MODE`, and `DATABASE_URL` are still accepted as compatibility aliases, but
new configuration should use the `GPU_BOOKING_` names.

`GPU_BOOKING_DATABASE_URL` defaults to `sqlite+aiosqlite:///./gpu_booking.db`.
With `make run`, the backend process starts in `backend/`, so the local SQLite
file is generated as `backend/gpu_booking.db`. That file and its SQLite sidecars
are ignored by git; delete them to reset local state, or set
`GPU_BOOKING_DATABASE_URL` to another SQLite or service database URL.

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

## HTTPS

By default the dev frontend serves plain HTTP. If your browser forces HTTPS for
the host (for example through HSTS), give the frontend a certificate and key:

```bash
export GPU_BOOKING_TLS_CERT=~/.config/devtls/$(hostname -f).crt
export GPU_BOOKING_TLS_KEY=~/.config/devtls/$(hostname -f).key
make run
```

You can instead put both in the repo-root `.env`, using absolute paths because
`.env` does not expand `~` or `$(...)`. Set both or neither: `run-dev.sh` and `pnpm dev` exit with an error,
naming the variable at fault, if only one is set, either file is unreadable, the
certificate is not a PEM certificate or has expired, the key is not a PEM private
key (for example, the certificate given twice), or the key does not match the
certificate. The app never creates a certificate for you.

With both set:

- `pnpm dev` runs `next dev --experimental-https` with that key and certificate.
- `run-dev.sh` health-checks `https://$(hostname -f):<port>` using the
  certificate as the trusted CA, and prints that URL. The certificate must name
  that host.
- The backend stays on plain HTTP; only the frontend server talks to it.

This applies to development only. `pnpm start` (production) still serves plain
HTTP; terminate TLS at the reverse proxy or load balancer in front of it.

### Creating a self-signed certificate macOS will trust

macOS (and so Safari and Chrome on a Mac) rejects a server certificate unless it:

- lists every host name you use in `subjectAltName` (the CN is ignored);
- is valid for at most 825 days;
- has `extendedKeyUsage` `serverAuth`;
- has `basicConstraints` `CA:FALSE`.

For example:

```bash
host=$(hostname -f)
mkdir -p ~/.config/devtls && chmod 700 ~/.config/devtls
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 825 \
  -keyout ~/.config/devtls/$host.key -out ~/.config/devtls/$host.crt \
  -subj "/CN=$host" \
  -addext "subjectAltName=DNS:$host" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth"
chmod 600 ~/.config/devtls/$host.key
```

Copy the `.crt` (never the key) to the Mac, open it in Keychain Access, and set
it to "Always Trust" for SSL.

### HTTPS with OIDC (Okta)

Without `GPU_BOOKING_OIDC_REDIRECT_URI`, the frontend derives the OIDC callback
from the request URL, which under `next dev -H 0.0.0.0` is
`https://0.0.0.0:<port>`, not the host name in your browser. Set both URIs
explicitly to the public HTTPS URL, and register the same values in Okta:

```bash
GPU_BOOKING_OIDC_REDIRECT_URI=https://<host>:<port>/auth/callback
GPU_BOOKING_OIDC_POST_LOGOUT_REDIRECT_URI=https://<host>:<port>/
```

Okta only accepts `https` redirect URIs, apart from `http://localhost`. A
self-signed certificate works because Okta only redirects the browser to the app
and never connects to it.

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
- Backend pytest config uses an isolated SQLite database under `.tmp/agent/backend-tests/` so tests do not mutate the local development database.
- Frontend Playwright E2E coverage starts FastAPI and Next.js from `frontend/playwright.config.ts` against an isolated SQLite database and uses the preinstalled Chromium/browser path from the environment.
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
