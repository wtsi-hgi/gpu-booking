---
name: verify-gpu-booking
description: "Verify GPU Booking UTC timestamps after booking table or admin drawer changes with the isolated Playwright harness."
---

# Verify GPU Booking

Run from the repository root. See [features](features/README.md) for coverage.

## Doctor

Use existing dependencies and Chromium. Preserve `PLAYWRIGHT_BROWSERS_PATH`.

```bash
backend/.venv/bin/python -c "import fastapi, uvicorn, aiosqlite"
pnpm --dir frontend exec node -e "const {chromium}=require('@playwright/test'); if (!require('node:fs').existsSync(chromium.executablePath())) process.exit(1)"
ss -ltnp '( sport = :3100 or sport = :8100 )'
```

Both ports must be free. External `node_modules` symlinks fail Turbopack
startup; use worktree-local pnpm dependencies. No system or browser installs.

## Launch And Drive

```bash
mkdir -p .tmp/agent
TZ=UTC timeout 300s pnpm --dir frontend exec playwright test e2e/booking-timestamps.spec.ts > .tmp/agent/verify-timestamps.log 2>&1
```

Playwright starts and stops both servers. It waits for backend health on 8100
and frontend health on 3100, resets an isolated SQLite database under
`.tmp/agent/playwright/`, and uses insecure development authentication.
Serialize harness runs because ports and database paths are fixed.

## Evidence And Cleanup

Inspect test totals, assertions, and `.tmp/agent/booking-timestamps.png`.
Failure screenshots and traces are under
`.tmp/agent/playwright/test-results/`. Routine captures remain in scratch;
archive selected before/after evidence in `.docs/bugfixes/evidence/` once.

Record the feature, tested revision and uncommitted diff, expected and observed
UTC displays, evidence paths, and verdict. Use VERIFIED only when the browser
assertions pass, NOT VERIFIED for product failures, and INCONCLUSIVE for
missing access or evidence. A green build alone does not verify timestamps.

Wait for the command to exit, confirm both ports are free with Doctor's `ss`
command, and confirm the evidence remains. If interrupted, stop only the
process tree started by that run. Repeat Doctor after a failed launch.
