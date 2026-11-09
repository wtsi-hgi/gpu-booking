---
name: verify-gpu-booking
description: "Verify GPU Booking user paths with the repository's isolated Playwright harness after UI or booking changes."
---

# Verify GPU Booking

Run from the repository root. Feature recipes are indexed in
[features/README.md](features/README.md).

## Doctor

Use the existing Python environment, pnpm dependencies, and Chromium browser.
Keep `PLAYWRIGHT_BROWSERS_PATH` when supplied by the environment. Install only
repository dependencies when missing; do not install system packages or browsers.

```bash
backend/.venv/bin/python -c "import fastapi, uvicorn, aiosqlite"
pnpm --dir frontend exec node -e "const {chromium}=require('@playwright/test'); if (!require('node:fs').existsSync(chromium.executablePath())) process.exit(1)"
ss -ltnp '( sport = :3100 or sport = :8100 )'
```

Ports 3100 and 8100 must be free. Stop before driving if another instance owns
either port. Repeat Doctor after a failed launch.

## Launch And Drive

```bash
mkdir -p .tmp/agent
timeout 300s pnpm --dir frontend exec playwright test e2e/booking-inputs.spec.ts > .tmp/agent/verify-booking-inputs.log 2>&1
```

Playwright owns startup and shutdown. Its config waits for backend
`/api/v1/health` on 8100 and frontend `/api/health` on 3100. It creates fresh
seeded SQLite data at `.tmp/agent/playwright/gpu-booking-e2e.sqlite3`, uses
insecure development authentication, and never needs LDAP or LSF. Run one
harness at a time because ports and database paths are fixed.

Use the feature recipes for other specs. `make lint` and `make test` are the
full project gates. The harness's API helpers create fixtures; exercise the
changed behaviour through rendered controls, not direct database writes.

## Evidence And Cleanup

Read the log's test totals and assertions. Screenshots from the command above
are `.tmp/agent/calendar-week-start-after.png`,
`.tmp/agent/booking-days-after.png`, `.tmp/agent/cost-codes-after.png`,
`.tmp/agent/project-pis-after.png` and
`.tmp/agent/technical-leads-after.png`,
`.tmp/agent/workflow-gpu-warning-after.png` and
`.tmp/agent/workflow-gpu-warning-admin-after.png`. Routine screenshots stay in
`.tmp/agent/`; archive selected bugfix evidence separately so reruns cannot
change tracked evidence. On failure, screenshots, traces and videos are under
`.tmp/agent/playwright/test-results/`.

Inspect relevant screenshots. Record each feature's expected and observed
outcome, tested commit and uncommitted changes, verdict, and evidence paths.
Use VERIFIED only for passing user paths and their persisted side effects;
report product failures as NOT VERIFIED and missing access as INCONCLUSIVE.
Keep evidence uncommitted unless the task specifies a committed evidence path.

Wait for the command to exit. Confirm ports 3100 and 8100 are free and named
evidence files remain. If interrupted, stop only the process tree started by
this run, using its recorded handle. Retain evidence after cleanup.
