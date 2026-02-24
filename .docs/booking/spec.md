# GPU Booking Specification

## Overview

This feature replaces the current Google Form plus Google Sheet workflow with
an authenticated web application for GPU booking requests and approvals. The
system provides one unified interface for users to submit bookings and inspect
capacity, and a separate admin workflow for review decisions and operational
configuration.

The application follows the existing Next.js + FastAPI architecture in this
repository. Browsers interact with Next.js pages and Server Actions, and the
server layer calls FastAPI APIs. The system stores bookings in SQLite first,
with an explicit data access abstraction so MySQL can be adopted later without
changing business logic.

Policy rules are implemented with two outcomes: warning-level violations are
shown but do not block submission, while over-allocation above 100% hard
capacity is blocked. Booking times are whole-day UK-local dates. The booking
window, statuses, and required fields preserve current operational practice.
The system is scoped for a small user base (fewer than 100 users).

## Architecture

### High-level component design

- Frontend (Next.js App Router):
  - Server Components render the calendar and table views.
  - Client Components handle drag selection, filters, and form UX.
  - Server Actions perform authenticated mutations.
  - API Route exposes an external monitor-friendly health endpoint.
- Backend (FastAPI):
  - Versioned REST endpoints under `backend/api/v1/`.
  - Policy engine computes warnings and hard-capacity blocks.
  - Persistence layer supports SQLite now and MySQL later.
- Database:
  - SQLite default (`sqlite+aiosqlite`) for simplicity.
  - MySQL supported via DSN switch (`mysql+aiomysql`).

### Operational policy interpretation

- Booking requests are presented to admins in first-come order by `created_at`.
- Admins can override first-come handling for strategic or cross-team priority
  cases, but must record a private reason.
- Conflict resolution remains human-led. The system surfaces overlaps and
  warnings, and admin notes capture escalation outcomes.

### New and changed files

- Backend API:
  - `backend/api/v1/bookings.py`
  - `backend/api/v1/admin.py`
  - `backend/api/v1/reference_data.py`
  - `backend/api/v1/authz.py`
- Backend models:
  - `backend/api/schemas.py` additions for booking, status, policy warnings,
    and reference data.
- Backend persistence:
  - `backend/db/models.py`
  - `backend/db/session.py`
  - `backend/db/repositories/*.py`
  - `backend/db/bootstrap.py`
- Backend services:
  - `backend/services/booking_policy.py`
  - `backend/services/capacity.py`
  - `backend/services/authz.py`
- Frontend contracts:
  - `frontend/lib/contracts.ts` additions for booking, admin, and reference
    data schemas.
- Frontend data access:
  - `frontend/app/actions.ts` additions for booking, cancel, admin decision,
    and admin configuration updates.
- Frontend pages:
  - `frontend/app/page.tsx` replaced with booking dashboard.
  - `frontend/app/admin/page.tsx` for admin controls.
- Frontend UI:
  - `frontend/components/booking-calendar.tsx`
  - `frontend/components/booking-form.tsx`
  - `frontend/components/bookings-table.tsx`
  - `frontend/components/admin/*.tsx`
  - `frontend/components/auth/user-switch.tsx`
- Tests:
  - `backend/tests/test_bookings_api.py`
  - `backend/tests/test_policy_engine.py`
  - `frontend/tests/bookings.contracts.test.ts`
  - `frontend/tests/policy-warnings.test.ts`

### Data model

Core tables:

- `users`
  - `id`, `email` (unique), `display_name`, `created_at`.
- `admin_allowlist`
  - `id`, `email` (unique), `created_at`, `created_by`.
- `gpu_types`
  - `id`, `name` (unique), `gram_gb`, `system_memory_gb`, `total_gpus`,
    `active`, `updated_at`.
- `workflow_types`
  - `id`, `name` (unique), `active`, `updated_at`.
- `memory_options`
  - `id`, `kind` (`GRAM` or `SYSTEM`), `label`, `numeric_value_gb` nullable,
    `active`, `sort_order`.
- `app_settings`
  - key/value rows including `memory_mode` (`manual` default, `auto` future).
- `bookings`
  - `id`, `requester_email`, `requested_for_email` nullable,
    `start_date_uk`, `end_date_uk_exclusive`, `gpu_count`, `gpu_type_id`,
    `workflow_type_id`, `gram_option_id`, `system_memory_option_id`,
    `project_name`, `project_pi_lead`, `project_or_grant_number`,
    `technical_lead`, `event_start_date`, `event_end_date`,
    `decision_status`, `priority_basis`, `admin_reason_internal`,
    `escalation_note_internal`, `cancelled_at`, `cancelled_by`,
    `last_modified_at`, `last_modified_by`, `created_at`, `updated_at`.

### Booking status and capacity semantics

`decision_status` enum values:

- `UNCONFIRMED` (default for new requests)
- `TENTATIVE`
- `CONFIRMED`
- `SPOT_BOOKING`
- `REJECTED`

Capacity buckets per day and GPU type:

- `hard_booked_gpus`: sum of `CONFIRMED` + `SPOT_BOOKING`.
- `soft_requested_gpus`: sum of `UNCONFIRMED` + `TENTATIVE`.
- `total_requested_gpus`: hard + soft.

Blocking rule:

- A booking create/edit decision is rejected only if resulting
  `hard_booked_gpus` would exceed 100% `total_gpus` for any covered day.

Warning rules (never block):

- less than 14 days advance notice,
- duration outside 1 to 14 days,
- requester exceeds 40% of configured GPU type capacity for any covered day.

For the 40% warning, sum all non-cancelled, non-rejected bookings for the same
requester and GPU type for each day in the requested interval.

### Time model

- Store booking dates as UK-local date boundaries.
- Interpret `start_date_uk` as inclusive and `end_date_uk_exclusive` as
  exclusive at 00:00 Europe/London.
- Minimum duration is 1 day (`end_date_uk_exclusive = start + 1 day`).

### Auth model

- Default mode: Okta OIDC web login in Next.js server layer.
- Role resolution: authenticated user is admin if email exists in
  `admin_allowlist`.
- Insecure testing mode (`AUTH_MODE=insecure`): no external auth,
  current browser user is treated as admin by default, and a user-switch
  dropdown allows toggling persona and admin/non-admin behavior.

### API shape (internal, future-external ready)

- `GET /api/v1/bookings`
- `POST /api/v1/bookings`
- `POST /api/v1/bookings/{id}/cancel`
- `GET /api/v1/admin/bookings`
- `PATCH /api/v1/admin/bookings/{id}` (admin edit)
- `POST /api/v1/admin/bookings/{id}/decision`
- `GET /api/v1/reference/gpu-types`
- `PUT /api/v1/admin/reference/gpu-types/{id}`
- `GET /api/v1/reference/workflow-types`
- `PUT /api/v1/admin/reference/workflow-types/{id}`
- `GET /api/v1/reference/memory-options`
- `PUT /api/v1/admin/reference/memory-options/{id}`
- `GET /api/v1/admin/settings`
- `PUT /api/v1/admin/settings`
- `GET /api/v1/health`
- `GET /api/v1/ready`

### Machine-parsable logs

Emit JSON logs from backend and Next.js server handlers with keys:
`timestamp`, `level`, `service`, `request_id`, `route`, `user_email`,
`action`, `status_code`, `duration_ms`, `error_code` nullable.

### 4-column TSV data example

```tsv
record_type\trecord_id\tfield\tvalue
booking\tbk_20260202_001\tdecision_status\tSPOT_BOOKING
day_capacity\t2026-02-04|H100\thard_booked_gpus\t12
day_capacity\t2026-02-04|H100\ttotal_requested_gpus\t18
booking\tbk_20260202_001\tadmin_reason_internal\t"Moveable if strategic job arrives"
```

## Section A: Authentication and Authorization

### A1: Okta OIDC login with DB-backed admin role

As an authenticated researcher, I want to sign in with Okta and receive the
correct role, so that booking actions are tied to identity and admin functions
are restricted.

**Package:** `frontend/`, `backend/`
**File:** `frontend/app/(auth)/*`, `frontend/lib/auth/session.ts`,
`backend/services/authz.py`
**Test file:** `backend/tests/test_authz.py`, `frontend/tests/auth-session.test.ts`

The Next.js server layer performs OIDC login and stores a secure session cookie
containing email and subject identifier. Backend endpoints receive identity
context from Server Actions and enforce admin-only operations with a shared
authorization dependency.

**Acceptance tests:**

1. Given a valid Okta callback payload, when the callback route completes,
   then a secure HTTP-only session cookie is set and contains the user's email.
2. Given an authenticated email in `admin_allowlist`, when calling an admin
   endpoint through Server Actions, then the response status is 200.
3. Given an authenticated email not in `admin_allowlist`, when calling the same
   admin endpoint, then the response status is 403 and JSON contains
   `{"message": "Admin access required"}`.
4. Given no session cookie, when requesting booking creation, then the user is
   redirected to login in OIDC mode.

### A2: Insecure testing mode with user switch

As a developer, I want an insecure auth mode with persona switching, so that I
can test admin and non-admin UX without Okta during local setup.

**Package:** `frontend/`, `backend/`
**File:** `frontend/components/auth/user-switch.tsx`, `frontend/lib/auth/mode.ts`,
`backend/services/authz.py`
**Test file:** `backend/tests/test_authz.py`, `frontend/tests/insecure-auth.test.ts`

When `AUTH_MODE=insecure`, auth middleware bypasses OIDC. The current browser
persona defaults to admin and can be changed with a dropdown that updates
session identity for subsequent Server Action calls.

**Acceptance tests:**

1. Given `AUTH_MODE=insecure`, when opening the app, then the user is treated
   as authenticated admin without Okta redirects.
2. Given insecure mode and persona switched to non-admin, when opening admin
   page, then admin controls are hidden and API calls return 403.
3. Given persona switched from non-admin back to admin, when reloading admin
   page, then admin controls and successful API responses return.
4. Given `AUTH_MODE=oidc`, when loading the app, then the user-switch control
   is not rendered.

## Section B: Reference Data and Capacity Configuration

### B1: Seeded and admin-configurable GPU/workflow/memory reference data

As an admin, I want to manage GPU types, capacities, workflow options, and
memory options, so that booking validation reflects current operations.

**Package:** `backend/`, `frontend/`
**File:** `backend/db/bootstrap.py`, `backend/api/v1/reference_data.py`,
`frontend/app/admin/page.tsx`
**Test file:** `backend/tests/test_reference_data_api.py`,
`frontend/tests/reference-data.contracts.test.ts`

Seed defaults on first startup:

- GPU types: `H200`, `H100`, `A100`, `V100`.
- Workflow types: current four Google form values.
- GRAM options: `80GB`, `60GB`, `40GB`, `<=20GB`.
- System memory options: `500GB`, `56GB`, `100GB`, `50GB`, `25GB`, `10GB`,
  `<10GB`.

Admins can modify active values and capacities in the UI.

**Acceptance tests:**

1. Given an empty DB at first startup, when bootstrap runs, then all default
   GPU types, workflow types, and memory options are inserted once.
2. Given an existing DB with seeded rows, when startup runs again, then no
   duplicate reference rows are created.
3. Given admin updates `H100.total_gpus` from 16 to 20, when a user requests
   availability for a month, then calculations use 20.
4. Given a non-admin user, when calling reference update endpoints, then the
   response is 403.

### B2: Admin allowlist seeded from environment variable

As an operator, I want admin emails initialized from environment config, so
that first deployment has known administrators without manual SQL.

**Package:** `backend/`
**File:** `backend/config.py`, `backend/db/bootstrap.py`, `backend/db/models.py`
**Test file:** `backend/tests/test_bootstrap_admins.py`

Use `INITIAL_ADMIN_EMAILS` as a comma-separated list. On first startup, insert
missing emails into `admin_allowlist`. On later startups, merge additions and
never delete rows automatically.

**Acceptance tests:**

1. Given `INITIAL_ADMIN_EMAILS="a@sanger.ac.uk,b@sanger.ac.uk"` and empty DB,
   when startup runs, then both emails exist in `admin_allowlist`.
2. Given one existing admin row and env var with two emails, when startup runs,
   then the missing email is added and existing row is unchanged.
3. Given an empty env var, when startup runs, then bootstrap succeeds without
   raising and writes a warning log entry.
4. Given duplicate emails in env var with mixed case, when startup runs, then
   only one normalized lowercase row is stored per email.

## Section C: Booking Request Creation and Validation

### C1: Booking form preserving all existing fields

As a researcher, I want a booking form that keeps the current data fields, so
that existing operational information is still captured.

**Package:** `frontend/`, `backend/`
**File:** `frontend/components/booking-form.tsx`, `frontend/app/actions.ts`,
`backend/api/v1/bookings.py`, `backend/api/schemas.py`
**Test file:** `backend/tests/test_bookings_api.py`,
`frontend/tests/booking-form-validation.test.ts`

Required fields include booking start/end dates, GPU count, workflow type,
required GPU type, GRAM option, and system memory option (while
`memory_mode=manual`). Optional fields remain optional: requested-for email,
project name, PI/lead, grant number, technical lead, and event start/end dates.
Event dates stay distinct from booking dates.

**Acceptance tests:**

1. Given valid required fields and omitted optional fields, when submitting the
   form, then API returns 201 and stores null for optional columns.
2. Given missing GPU type, when submitting, then API returns 422 and error
   payload includes `gpu_type_id`.
3. Given event dates outside booking window, when submitting, then booking is
   accepted and event dates are stored unchanged.
4. Given `memory_mode=manual`, when GRAM or system memory option is missing,
   then API returns 422.
5. Given `memory_mode=auto`, when GRAM/system memory options are omitted, then
   API accepts the request and stores null for both option IDs.
6. Given an authenticated Okta user not in `admin_allowlist`, when submitting a
   valid booking, then API returns 201 and creates the booking.
7. Given booking start `2026-02-02` and end `2026-02-06`, when stored, then the
   reservation covers up to `2026-02-05 23:59:59` UK local time.

### C2: Policy warning engine with hard 100% capacity block

As a requester, I want immediate validation feedback, so that I can understand
policy risks while still submitting requests that are allowed.

**Package:** `backend/`, `frontend/`
**File:** `backend/services/booking_policy.py`, `backend/services/capacity.py`,
`frontend/components/booking-form.tsx`
**Test file:** `backend/tests/test_policy_engine.py`,
`frontend/tests/policy-warnings.test.ts`

The policy engine returns `warnings[]` and `blocking_errors[]` per request.
Warnings include advance-notice, duration, and 40% per-user share checks.
Blocking occurs only if hard capacity would exceed 100% for any day and GPU
kind, treating `SPOT_BOOKING` as hard-booked.

**Acceptance tests:**

1. Given a request 7 days ahead, when validating, then result includes warning
   code `ADVANCE_NOTICE_LT_14_DAYS` and no blocking error.
2. Given a 21-day request, when validating, then result includes warning code
   `DURATION_GT_14_DAYS` and submission is still allowed if capacity allows.
3. Given existing confirmed plus spot bookings of 14 H100 on a day with
   capacity 16, when creating a 3-GPU request for that day, then API returns
   409 with blocking code `CAPACITY_EXCEEDED_100_PERCENT`.
4. Given a user already holding 7 of 16 H100 on a day, when requesting 1 more,
   then result includes warning code `USER_OVER_40_PERCENT` and request is
   accepted if not over 100% hard capacity.
5. Given 15 pending-only GPUs (`UNCONFIRMED` or `TENTATIVE`) and 0 hard-booked
   GPUs on a 16-GPU day, when requesting 2 GPUs, then no hard-capacity block is
   returned because only hard-booked usage enforces the 100% limit.

### C3: Booking permissions for cancel vs edit

As a user, I want to cancel my own booking but not edit it, so that ownership
is respected while keeping admin control over modifications.

**Package:** `backend/`, `frontend/`
**File:** `backend/api/v1/bookings.py`, `backend/api/v1/admin.py`,
`frontend/components/bookings-table.tsx`
**Test file:** `backend/tests/test_bookings_api.py`,
`frontend/tests/booking-permissions.test.ts`

Users can cancel only their own active bookings. Users cannot edit any booking.
Admins can edit and cancel any booking.

**Acceptance tests:**

1. Given user `u1` owns booking `b1`, when `u1` calls cancel on `b1`, then
   response is 200 and booking has `cancelled_at` populated.
2. Given user `u2` does not own `b1`, when `u2` calls cancel on `b1`, then
   response is 403.
3. Given non-admin user calls admin edit endpoint, when request is sent, then
   response is 403.
4. Given admin edits booking `b1`, when request succeeds, then updated fields
   persist and `last_modified_by` equals admin email.

## Section D: Calendar and Table Booking Views

### D1: Monthly calendar with capacity visibility and drag creation

As a researcher, I want a monthly calendar that shows booked capacity and lets
me create date ranges quickly, so that I can pick feasible booking windows.

**Package:** `frontend/`, `backend/`
**File:** `frontend/components/booking-calendar.tsx`,
`frontend/app/(dashboard)/page.tsx`, `backend/api/v1/bookings.py`
**Test file:** `frontend/tests/booking-calendar.test.ts`,
`backend/tests/test_bookings_api.py`

Calendar requirements:

- traditional month grid,
- per-day percent capacity indicator,
- per-day available GPU count (`total_gpus - hard_booked_gpus`),
- GPU-type filter,
- used capacity computed from all active bookings,
- visual distinction of hard (`CONFIRMED`, `SPOT_BOOKING`) vs pending
  (`UNCONFIRMED`, `TENTATIVE`) via color/hatching,
- double-click and drag interaction prefills booking form dates.

**Acceptance tests:**

1. Given mixed statuses on one day, when calendar renders, then day cell shows
   `total_requested_gpus / total_gpus` percentage using all statuses.
2. Given bookings with confirmed and unconfirmed statuses, when rendering day
   overlays, then hard bookings and pending bookings use distinct style tokens.
3. Given GPU type filter set to `H100`, when rendering month view, then counts
   use only `H100` bookings and capacity.
4. Given user drags from 2026-02-02 to 2026-02-06, when drag ends, then booking
   form is prefilled with start `2026-02-02` and end `2026-02-06` exclusive.
5. Given a day with 16 total H100 and 12 hard-booked H100, when rendering day
   details for H100, then available capacity is displayed as 4 GPUs.

### D2: Searchable, sortable booking table view

As a researcher or admin, I want a table view with filtering and search, so
that I can inspect bookings more precisely than the calendar alone.

**Package:** `frontend/`, `backend/`
**File:** `frontend/components/bookings-table.tsx`, `backend/api/v1/bookings.py`
**Test file:** `frontend/tests/bookings-table.test.ts`,
`backend/tests/test_bookings_api.py`

The table supports pagination, sort by date/status/requester, free-text search
across project fields, and status filters.

**Acceptance tests:**

1. Given bookings with different start dates, when sorting ascending by start,
   then rows are ordered earliest to latest.
2. Given search text `grant-42`, when querying table data, then only rows with
   matching project or grant fields are returned.
3. Given status filter `UNCONFIRMED`, when filter is applied, then confirmed,
   tentative, spot, and rejected rows are excluded.
4. Given user is non-admin, when viewing rows, then `admin_reason_internal`
   column is absent.

## Section E: Admin Review and Audit Workflow

### E1: Admin decisioning with internal reasoning

As an admin, I want to set booking decision status with private rationale, so
that review outcomes are tracked without exposing internal notes to requesters.

**Package:** `backend/`, `frontend/`
**File:** `backend/api/v1/admin.py`, `frontend/components/admin/decision-panel.tsx`
**Test file:** `backend/tests/test_admin_decisions.py`,
`frontend/tests/admin-decision-panel.test.ts`

Each booking is `UNCONFIRMED` by default. Admins can set `CONFIRMED`,
`TENTATIVE`, `SPOT_BOOKING`, or `REJECTED` and store free-text
`admin_reason_internal`. Non-admin users never receive this field in payloads.

**Acceptance tests:**

1. Given a new booking, when fetched after creation, then `decision_status`
   equals `UNCONFIRMED`.
2. Given admin sets status to `SPOT_BOOKING` with reason text, when saving,
   then API returns 200 and row stores both values.
3. Given non-admin fetches the same booking, when response is returned, then
   `admin_reason_internal` is omitted.
4. Given admin changes status from `SPOT_BOOKING` to `CONFIRMED`, when
   validated, then hard-capacity rules are re-evaluated before save.

### E2: Admin booking edits with last-modified tracking

As an admin, I want editable booking metadata and audit stamps, so that policy
exceptions and corrections are visible and attributable.

**Package:** `backend/`, `frontend/`
**File:** `backend/api/v1/admin.py`, `backend/db/models.py`,
`frontend/components/admin/booking-editor.tsx`
**Test file:** `backend/tests/test_admin_edit_audit.py`,
`frontend/tests/admin-booking-editor.test.ts`

Admin edits update mutable booking fields and always set
`last_modified_at` and `last_modified_by`. This audit mechanism is simple and
does not require a full change-history table for this version.

**Acceptance tests:**

1. Given admin edits `project_name`, when save succeeds, then booking row has
   updated `project_name`, non-null `last_modified_at`, and admin email in
   `last_modified_by`.
2. Given two sequential admin edits by different admins, when second edit saves,
   then `last_modified_by` matches the second admin and timestamp is newer.
3. Given non-admin attempts edit mutation, when request is made, then API
   returns 403 and booking row remains unchanged.
4. Given admin edit that would exceed hard capacity, when validating, then API
   returns 409 with capacity error and no persistence change.

### E3: First-come review queue with documented priority overrides

As an admin, I want default first-come triage with explicit override reasons,
so that fair access is visible and strategic exceptions are auditable.

**Package:** `backend/`, `frontend/`
**File:** `backend/api/v1/admin.py`, `backend/api/schemas.py`,
`frontend/components/admin/review-queue.tsx`
**Test file:** `backend/tests/test_admin_review_queue.py`,
`frontend/tests/admin-review-queue.test.ts`

The admin queue defaults to ascending `created_at` for `UNCONFIRMED` items.
Admins can set an optional priority basis (`NONE`, `STRATEGIC`,
`CROSS_TEAM_PRIORITY`) and must provide an internal reason when the basis is
not `NONE`. Queue UI shows conflict indicators and links to internal escalation
notes without exposing them to non-admin users.

**Acceptance tests:**

1. Given three unconfirmed bookings created at different times, when admin
   loads the queue, then rows are sorted oldest to newest by default.
2. Given admin sets `priority_basis=STRATEGIC`, when reason text is empty, then
   API returns 422 requiring `admin_reason_internal`.
3. Given admin sets strategic priority with reason on one booking, when queue is
   refreshed, then that booking is visibly marked as priority override.
4. Given non-admin loads booking list, when response is returned, then priority
   basis and internal reason fields are omitted.

## Section F: APIs, Health, and Operations

### F1: Internal REST API contracts for future external use

As a future integrator, I want stable JSON APIs with explicit schemas, so that
external tooling can later automate booking workflows safely.

**Package:** `backend/`, `frontend/`
**File:** `backend/api/schemas.py`, `backend/api/v1/*.py`,
`frontend/lib/contracts.ts`, `frontend/app/actions.ts`
**Test file:** `backend/tests/test_api_contracts.py`,
`frontend/tests/bookings.contracts.test.ts`

Every backend response model must have a matching Zod schema. Server Actions
use `backendJson()` for schema-validated calls. Browser clients do not call
FastAPI directly.

**Acceptance tests:**

1. Given backend booking list response, when parsed with frontend Zod schema,
   then parse succeeds and inferred types expose expected fields.
2. Given malformed response missing `decision_status`, when parsed with
   `.safeParse()`, then parse fails with `success=false`.
3. Given create-booking action in frontend, when invoked, then request is sent
   by Server Action and not from client-side `fetch`.
4. Given a new endpoint added under admin router, when implemented, then it has
   both Pydantic response model and matching Zod contract test.

### F2: Health/readiness endpoints and JSON structured logs

As an operator, I want machine-parsable health and log outputs, so that Nagios,
ELK, and alerting systems can consume service telemetry.

**Package:** `backend/`, `frontend/`
**File:** `backend/api/v1/health.py`, `frontend/app/api/health/route.ts`,
`backend/main.py`
**Test file:** `backend/tests/test_health_readiness.py`,
`frontend/tests/health-route.test.ts`

Expose:

- `GET /api/v1/health`: process alive,
- `GET /api/v1/ready`: DB reachable and reference data loaded,
- `GET /api/health` (Next API route): upstream aggregate for external checks.

Logs are JSON lines, one event per request, without multiline stack traces
unless explicitly encoded as string fields.

**Acceptance tests:**

1. Given app is running and DB available, when calling `/api/v1/ready`, then
   status is 200 and payload includes `{"status": "ready"}`.
2. Given DB connection fails, when calling `/api/v1/ready`, then status is 503
   and payload includes `{"status": "unready"}`.
3. Given external monitor calls `GET /api/health`, when backend is healthy,
   then response is 200 and payload includes `{"status": "healthy"}`.
4. Given a booking mutation request, when log is emitted, then log line is valid
   JSON and includes keys `request_id`, `route`, `user_email`, and `duration_ms`.

## Section G: Deployment and Database Portability

### G1: Kubernetes-friendly env-var configuration and DB swappability

As a platform engineer, I want environment-driven configuration and a portable
persistence layer, so that deployment is simple in k8s and migration to MySQL
is low-risk.

**Package:** `backend/`, `frontend/`
**File:** `backend/config.py`, `backend/db/session.py`,
`frontend/lib/backend-client.ts`
**Test file:** `backend/tests/test_db_config.py`,
`frontend/tests/runtime-config.test.ts`

The application is configured only through environment variables for auth,
backend URLs, DB DSN, insecure auth mode, and seed data. No Dockerfile or Helm
artifacts are part of this spec. App behavior must remain valid in a
containerized runtime with liveness/readiness probing and stdout logging.

**Acceptance tests:**

1. Given `DATABASE_URL=sqlite+aiosqlite:///./data/app.db`, when app starts,
   then DB session opens and migrations/bootstrap complete.
2. Given `DATABASE_URL=mysql+aiomysql://u:p@db/gpu_booking`, when app starts,
   then DB engine initializes with MySQL dialect without code changes.
3. Given required OIDC env vars missing in `AUTH_MODE=oidc`, when startup
   validation runs, then app fails fast with explicit config error.
4. Given `AUTH_MODE=insecure`, when OIDC env vars are absent, then app starts
   successfully and uses insecure auth flow.

### G2: Small-scale performance target (<100 users)

As an operator, I want predictable behavior at small scale, so that this
service remains reliable for the expected user count without complex scaling
infrastructure in this version.

**Package:** `backend/`, `frontend/`
**File:** `backend/api/v1/bookings.py`, `backend/db/repositories/bookings.py`,
`frontend/app/(dashboard)/page.tsx`
**Test file:** `backend/tests/test_small_scale_limits.py`,
`frontend/tests/dashboard-latency.test.ts`

The design target is fewer than 100 users. Queries should use pagination and
indexed date/gpu-type filters to keep month and table views responsive.

**Acceptance tests:**

1. Given 100 users and 5000 bookings in test data, when listing one month with
   one GPU type filter, then backend responds with status 200 within 1 second
   in local test environment.
2. Given large booking history, when loading dashboard default month, then
   frontend request payload size excludes unrelated months and remains bounded.
3. Given table view pagination size 50, when requesting page 3, then API
   returns exactly 50 rows (or remaining rows if fewer) plus total count.
4. Given date and GPU type filters, when database query plan is inspected in
   tests, then indexed fields are used for the primary scan.

## Implementation Order

1. Phase 1 - Persistence and reference data foundation (`B1`, `B2`, `G1`)
2. Phase 2 - Auth and authorization modes (`A1`, `A2`)
3. Phase 3 - Booking creation and policy engine (`C1`, `C2`)
4. Phase 4 - User booking lifecycle and views (`C3`, `D1`, `D2`)
5. Phase 5 - Admin review and edit workflows (`E1`, `E2`, `E3`)
6. Phase 6 - Contract hardening and operations (`F1`, `F2`, `G2`)

## Appendix: Key Decisions

- Browser-to-backend calls remain BFF-only through Next.js Server Actions and
  API Routes.
- No email notifications are implemented in this version.
- No import path from the current Google Sheet is implemented in this version.
- Cluster/queue selection remains out of scope; capacity uses a flat GPU pool
  per GPU type.
- Spot bookings are treated as hard allocations for capacity warnings and hard
  blocking checks.
- Booking policy conflicts are surfaced as warnings and admin decision context,
  not automatic conflict resolution logic.
- The memory option design supports future removal/toggle via `memory_mode`
  setting while preserving current fixed-option behavior.
