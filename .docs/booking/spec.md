# GPU Booking Specification

## Overview

This application replaces the existing Google Form and Google Sheet
workflow used at the Sanger Institute for booking GPUs. The current
process is manual, error-prone, and lacks capacity validation or
calendar visibility. The new system provides a web-based interface
where researchers can view existing bookings, check available
capacity, and submit booking requests - all with real-time validation
against cluster capacity limits.

Sanger operates GPU clusters (Tiger) that support AI4Science research
programmes. Large-scale training jobs require pre-booked GPU
allocations to avoid contention and ensure fair scheduling. The
application manages this through a calendar-based booking view, a
filterable table view, a booking creation form, and admin interfaces
for managing bookings, GPU capacity, workflow types, and configuration
options. Capacity validation provides soft warnings when utilisation
is high and hard blocks when capacity is fully consumed. Authentication
uses OIDC via Okta in production, with an insecure dev mode that
allows switching between arbitrary user and admin identities.

The system is built as a monorepo with a Next.js 16 frontend and a
FastAPI backend following the Backend-for-Frontend (BFF) pattern. The
frontend communicates with the backend exclusively through Server
Actions. The database layer uses SQLite for development and initial
deployment, with the schema and query layer designed for a clean swap
to MySQL when needed. The application is structured to be
Kubernetes-friendly, with health checks, environment-based
configuration, and stateless request handling.

## Architecture

### Database Schema

The database uses SQLite initially, with all schema definitions
designed to be compatible with a future MySQL migration. All tables
use auto-incrementing integer primary keys. Timestamps use ISO 8601
format. Date fields for booking periods represent UK-local calendar
dates (not UTC datetimes).

**`admins`**

| Column     | Type     | Notes              |
|------------|----------|--------------------|
| id         | INTEGER  | PK, auto-increment |
| email      | TEXT     | Unique, not null   |
| created_at | DATETIME | Default now        |

**`gpu_types`**

| Column           | Type     | Notes              |
|------------------|----------|--------------------|
| id               | INTEGER  | PK, auto-increment |
| name             | TEXT     | Unique, not null   |
| gram_gb          | INTEGER  | Not null           |
| system_memory_gb | INTEGER  | Not null           |
| total_count      | INTEGER  | Not null           |
| created_at       | DATETIME | Default now        |
| updated_at       | DATETIME | Default now        |

**`workflow_types`**

| Column     | Type     | Notes              |
|------------|----------|--------------------|
| id         | INTEGER  | PK, auto-increment |
| name       | TEXT     | Unique, not null   |
| created_at | DATETIME | Default now        |
| updated_at | DATETIME | Default now        |

**`gram_options`**

| Column     | Type     | Notes                    |
|------------|----------|--------------------------|
| id         | INTEGER  | PK, auto-increment       |
| label      | TEXT     | Not null (e.g. "80GB")   |
| value_gb   | INTEGER  | Not null                 |
| sort_order | INTEGER  | Not null                 |
| created_at | DATETIME | Default now              |

**`memory_options`**

| Column     | Type     | Notes                    |
|------------|----------|--------------------------|
| id         | INTEGER  | PK, auto-increment       |
| label      | TEXT     | Not null (e.g. "500GB")  |
| value_gb   | INTEGER  | Not null                 |
| sort_order | INTEGER  | Not null                 |
| created_at | DATETIME | Default now              |

**`bookings`**

| Column              | Type     | Notes                          |
|---------------------|----------|--------------------------------|
| id                  | INTEGER  | PK, auto-increment             |
| user_email          | TEXT     | Not null                       |
| gpu_type_id         | INTEGER  | FK -> gpu_types.id, not null   |
| gpu_count           | INTEGER  | Not null, > 0                  |
| gram_option_id      | INTEGER  | FK -> gram_options.id, not null|
| memory_option_id    | INTEGER  | FK -> memory_options.id, n.n.  |
| workflow_type_id    | INTEGER  | FK -> workflow_types.id, n.n.  |
| start_date          | DATE     | UK local date, not null        |
| end_date            | DATE     | UK local date, not null        |
| status              | TEXT     | Enum, not null                 |
| alt_email           | TEXT     | Nullable                       |
| project_name        | TEXT     | Nullable                       |
| project_pi          | TEXT     | Nullable                       |
| project_grant_number| TEXT     | Nullable                       |
| technical_lead      | TEXT     | Nullable                       |
| event_start_date    | DATE     | Nullable                       |
| event_end_date      | DATE     | Nullable                       |
| admin_notes         | TEXT     | Nullable, admin-only           |
| admin_modified_by   | TEXT     | Nullable                       |
| admin_modified_at   | DATETIME | Nullable                       |
| created_at          | DATETIME | Default now                    |
| updated_at          | DATETIME | Default now                    |

The `status` column uses an application-level enum with the following
values: `unconfirmed`, `confirmed`, `tentative`, `spot`, `rejected`,
`cancelled`.

For capacity calculations, the statuses `confirmed`, `tentative`, and
`spot` all count as "consuming capacity" and are shown as used in
capacity bars and validation checks. The status `unconfirmed` counts
as "pending" and is displayed differently in the calendar (e.g.
hatched or translucent) but still visible. The statuses `rejected` and
`cancelled` do not consume capacity and are excluded from capacity
totals.

### New Backend Files

| File                                | Purpose                         |
|-------------------------------------|---------------------------------|
| `backend/db/__init__.py`            | Database package init           |
| `backend/db/engine.py`             | SQLAlchemy async engine +       |
|                                     | session factory, configurable   |
|                                     | for SQLite/MySQL                |
| `backend/db/models.py`             | SQLAlchemy ORM models for all   |
|                                     | tables                          |
| `backend/db/seed.py`               | Seed initial GPU types,         |
|                                     | workflow types, GRAM/memory     |
|                                     | options, admin emails from      |
|                                     | env var                         |
| `backend/api/v1/bookings.py`       | Booking CRUD endpoints          |
| `backend/api/v1/admin.py`          | Admin endpoints (booking        |
|                                     | status, GPU config, workflow    |
|                                     | config, memory/GRAM config)     |
| `backend/api/v1/auth.py`           | Auth endpoints (login, logout,  |
|                                     | user info)                      |
| `backend/api/v1/capacity.py`       | Capacity calculation endpoints  |
| `backend/api/schemas.py`           | Extended with all new Pydantic  |
|                                     | response/request models         |
| `backend/services/__init__.py`     | Services package init           |
| `backend/services/booking_service.py` | Booking business logic       |
| `backend/services/capacity_service.py`| Capacity calculation logic   |
| `backend/services/auth_service.py` | Auth/session logic              |
| `backend/middleware/__init__.py`   | Middleware package init         |
| `backend/middleware/auth.py`       | Auth middleware (Okta OIDC +    |
|                                     | insecure dev mode)              |
| `backend/logging_config.py`       | Structured JSON logging         |
|                                     | configuration                   |
| `backend/middleware/request_context.py` | Request context middleware |
|                                     | for logging                     |

### New Frontend Files

| File                                       | Purpose                    |
|--------------------------------------------|----------------------------|
| `frontend/lib/booking-contracts.ts`        | Zod schemas for all        |
|                                            | booking-related API        |
|                                            | responses                  |
| `frontend/lib/admin-contracts.ts`          | Zod schemas for admin API  |
|                                            | responses                  |
| `frontend/lib/auth-contracts.ts`           | Zod schemas for auth API   |
|                                            | responses                  |
| `frontend/app/actions.ts`                  | Extended with              |
|                                            | booking/admin/auth Server  |
|                                            | Actions                    |
| `frontend/app/bookings/page.tsx`           | Main bookings page         |
|                                            | (calendar + table)         |
| `frontend/app/bookings/new/page.tsx`       | New booking form page      |
| `frontend/app/admin/page.tsx`              | Admin dashboard            |
| `frontend/app/admin/bookings/page.tsx`     | Admin booking management   |
| `frontend/app/admin/gpu-types/page.tsx`    | GPU type config            |
| `frontend/app/admin/workflow-types/page.tsx`| Workflow type config      |
| `frontend/app/admin/memory-options/page.tsx`| GRAM/memory options       |
|                                            | config                     |
| `frontend/app/api/health/route.ts`         | Existing, unchanged        |
| `frontend/components/calendar-view.tsx`    | Monthly calendar grid      |
|                                            | component                  |
| `frontend/components/booking-table.tsx`    | Sortable/filterable        |
|                                            | booking table              |
| `frontend/components/booking-form.tsx`     | Booking creation form      |
| `frontend/components/capacity-bar.tsx`     | Capacity usage             |
|                                            | visualization per day      |
| `frontend/components/admin-booking-panel.tsx`| Admin booking edit panel |
| `frontend/components/gpu-type-manager.tsx` | GPU type CRUD component    |
| `frontend/components/workflow-type-manager.tsx`| Workflow type CRUD     |
|                                            | component                  |
| `frontend/components/memory-option-manager.tsx`| GRAM/memory option     |
|                                            | CRUD                       |
| `frontend/components/user-switch.tsx`      | Dev mode user/admin switch |
|                                            | dropdown                   |
| `frontend/components/auth-provider.tsx`    | Auth context provider      |
| `frontend/lib/auth-state.ts`              | Auth state types           |
| `frontend/lib/booking-state.ts`           | Booking form state types   |

### Changes to Existing Files

- **`backend/main.py`** - Add database initialisation in the
  application lifespan handler, include new API routers for bookings,
  admin, auth, and capacity, and attach the auth middleware.
- **`backend/config.py`** - Add settings for database URL, auth mode
  (`oidc` or `insecure`), Okta configuration (issuer, client ID,
  client secret, redirect URI), and initial admin email addresses.
- **`frontend/app/layout.tsx`** - Wrap the application tree with the
  auth context provider component.
- **`frontend/app/page.tsx`** - Redirect authenticated users to
  `/bookings` or display a landing/login page.
- **`backend/api/v1/health.py`** - Extend health check to verify
  database connectivity and return structured response.

### Key API Endpoints

1. **`GET /api/v1/bookings`** - List bookings filtered by date range,
   GPU type, and status. Auth: any authenticated user. Response: list
   of `BookingResponse`.

2. **`POST /api/v1/bookings`** - Create a new booking. Auth: any
   authenticated user. Body: `BookingCreate`. Response:
   `BookingResponse`.

3. **`GET /api/v1/bookings/{id}`** - Get a single booking by ID.
   Auth: any authenticated user. Response: `BookingResponse`.

4. **`DELETE /api/v1/bookings/{id}`** - Cancel a booking. Auth: owner
   or admin. Response: `BookingResponse` (200).

5. **`PATCH /api/v1/admin/bookings/{id}`** - Admin update of a
   booking (status, notes, any field). Auth: admin only. Body:
   `AdminBookingUpdate`. Response: `BookingResponse`.

6. **`GET /api/v1/gpu-types`** - List all GPU types. Auth: any
   authenticated user. Response: list of `GpuTypeResponse`.

7. **`POST /api/v1/admin/gpu-types`** - Create a GPU type. Auth:
   admin only. Body: `GpuTypeCreate`. Response: `GpuTypeResponse`.

8. **`PUT /api/v1/admin/gpu-types/{id}`** - Update a GPU type. Auth:
   admin only. Body: `GpuTypeUpdate`. Response: `GpuTypeResponse`.

9. **`GET /api/v1/workflow-types`** - List all workflow types. Auth:
   any authenticated user. Response: list of `WorkflowTypeResponse`.

10. **`POST /api/v1/admin/workflow-types`** - Create a workflow type.
    Auth: admin only. Body: `WorkflowTypeCreate`. Response:
    `WorkflowTypeResponse`.

11. **`PUT /api/v1/admin/workflow-types/{id}`** - Update a workflow
    type. Auth: admin only. Body: `WorkflowTypeUpdate`. Response:
    `WorkflowTypeResponse`.

12. **`GET /api/v1/gram-options`** - List all GRAM options. Auth: any
    authenticated user. Response: list of `GramOptionResponse`.

13. **`POST /api/v1/admin/gram-options`** - Create a GRAM option.
    Auth: admin only. Body: `GramOptionCreate`. Response:
    `GramOptionResponse`.

14. **`PUT /api/v1/admin/gram-options/{id}`** - Update a GRAM option.
    Auth: admin only. Body: `GramOptionUpdate`. Response:
    `GramOptionResponse`.

15. **`GET /api/v1/memory-options`** - List all memory options. Auth:
    any authenticated user. Response: list of `MemoryOptionResponse`.

16. **`POST /api/v1/admin/memory-options`** - Create a memory option.
    Auth: admin only. Body: `MemoryOptionCreate`. Response:
    `MemoryOptionResponse`.

17. **`PUT /api/v1/admin/memory-options/{id}`** - Update a memory
    option. Auth: admin only. Body: `MemoryOptionUpdate`. Response:
    `MemoryOptionResponse`.

18. **`GET /api/v1/capacity?start_date=X&end_date=Y`** - Get capacity
    summary per day for the given date range. Auth: any authenticated
    user. Response: list of `DailyCapacity`.

19. **`GET /api/v1/auth/me`** - Get current user info and admin
    status. Auth: any authenticated user (or dev mode identity).
    Response: `UserInfo`.

20. **`POST /api/v1/auth/login`** - Initiate OIDC login flow (or dev
    mode login with an arbitrary email). Response: redirect or session
    token.

21. **`POST /api/v1/auth/logout`** - Clear the current session.
    Response: 204.

22. **`DELETE /api/v1/admin/gram-options/{id}`** - Delete a GRAM
    option. Auth: admin only. Response: 204.

23. **`DELETE /api/v1/admin/memory-options/{id}`** - Delete a memory
    option. Auth: admin only. Response: 204.

24. **`DELETE /api/v1/admin/workflow-types/{id}`** - Delete a workflow
    type. Auth: admin only. Response: 204.

### Key Pydantic Models (backend/api/schemas.py)

```python
class BookingStatus(str, Enum):
    unconfirmed = "unconfirmed"
    confirmed = "confirmed"
    tentative = "tentative"
    spot = "spot"
    rejected = "rejected"
    cancelled = "cancelled"


class BookingCreate(BaseModel):
    gpu_type_id: int
    gpu_count: int = Field(gt=0)
    gram_option_id: int
    memory_option_id: int
    workflow_type_id: int
    start_date: date
    end_date: date
    alt_email: str | None = None
    project_name: str | None = None
    project_pi: str | None = None
    project_grant_number: str | None = None
    technical_lead: str | None = None
    event_start_date: date | None = None
    event_end_date: date | None = None


class BookingResponse(BaseModel):
    id: int
    user_email: str
    gpu_type_id: int
    gpu_type_name: str
    gpu_count: int
    gram_option_id: int
    gram_label: str
    memory_option_id: int
    memory_label: str
    workflow_type_id: int
    workflow_type_name: str
    start_date: date
    end_date: date
    status: BookingStatus
    alt_email: str | None
    project_name: str | None
    project_pi: str | None
    project_grant_number: str | None
    technical_lead: str | None
    event_start_date: date | None
    event_end_date: date | None
    admin_notes: str | None  # only populated for admins
    admin_modified_by: str | None
    admin_modified_at: datetime | None
    created_at: datetime
    updated_at: datetime
    warnings: list[str]  # capacity/rule warnings


class AdminBookingUpdate(BaseModel):
    status: BookingStatus | None = None
    admin_notes: str | None = None
    gpu_type_id: int | None = None
    gpu_count: int | None = Field(None, gt=0)
    gram_option_id: int | None = None
    memory_option_id: int | None = None
    workflow_type_id: int | None = None
    start_date: date | None = None
    end_date: date | None = None
    alt_email: str | None = None
    project_name: str | None = None
    project_pi: str | None = None
    project_grant_number: str | None = None
    technical_lead: str | None = None
    event_start_date: date | None = None
    event_end_date: date | None = None


class GpuTypeResponse(BaseModel):
    id: int
    name: str
    gram_gb: int
    system_memory_gb: int
    total_count: int
    created_at: datetime
    updated_at: datetime


class GpuTypeCreate(BaseModel):
    name: str
    gram_gb: int = Field(gt=0)
    system_memory_gb: int = Field(gt=0)
    total_count: int = Field(gt=0)


class GpuTypeUpdate(BaseModel):
    name: str | None = None
    gram_gb: int | None = Field(None, gt=0)
    system_memory_gb: int | None = Field(None, gt=0)
    total_count: int | None = Field(None, gt=0)


class WorkflowTypeResponse(BaseModel):
    id: int
    name: str


class WorkflowTypeCreate(BaseModel):
    name: str


class WorkflowTypeUpdate(BaseModel):
    name: str | None = None


class GramOptionResponse(BaseModel):
    id: int
    label: str
    value_gb: int
    sort_order: int


class GramOptionCreate(BaseModel):
    label: str
    value_gb: int = Field(gt=0)
    sort_order: int


class GramOptionUpdate(BaseModel):
    label: str | None = None
    value_gb: int | None = Field(None, gt=0)
    sort_order: int | None = None


class MemoryOptionResponse(BaseModel):
    id: int
    label: str
    value_gb: int
    sort_order: int


class MemoryOptionCreate(BaseModel):
    label: str
    value_gb: int = Field(gt=0)
    sort_order: int


class MemoryOptionUpdate(BaseModel):
    label: str | None = None
    value_gb: int | None = Field(None, gt=0)
    sort_order: int | None = None


class DailyCapacity(BaseModel):
    date: date
    gpu_type_id: int
    gpu_type_name: str
    total: int
    confirmed_used: int  # confirmed + tentative + spot
    pending_used: int    # unconfirmed
    available: int
    user_used: int       # current user's usage
    user_percent: float  # user's % of total
    warnings: list[str]


class CapacityWarning(BaseModel):
    rule: str
    message: str
    severity: str  # "warning" or "block"


class BookingValidation(BaseModel):
    valid: bool
    warnings: list[CapacityWarning]
    blocked: bool
    block_reason: str | None = None


class UserInfo(BaseModel):
    email: str
    is_admin: bool
    auth_mode: str  # "oidc" or "insecure"
```

### Error Handling Policy

All API endpoints follow a consistent error response format. Every
error returns a JSON body with a single `detail` field containing a
human-readable message.

| Status Code | Meaning         | When Used                       |
|-------------|-----------------|---------------------------------|
| 400         | Bad Request     | Validation errors such as       |
|             |                 | invalid dates, missing required |
|             |                 | fields, or malformed input      |
| 401         | Unauthorized    | Request is not authenticated    |
|             |                 | (no session or expired token)   |
| 403         | Forbidden       | User is not an admin for admin  |
|             |                 | endpoints, or not the owner     |
|             |                 | for booking cancellation        |
| 404         | Not Found       | Booking or referenced resource  |
|             |                 | (GPU type, workflow type, etc.) |
|             |                 | does not exist                  |
| 409         | Conflict        | Booking would exceed 100%       |
|             |                 | capacity (hard block)           |

Example error response:

```json
{"detail": "GPU capacity fully consumed for 2026-03-15"}
```

## Section A: Database and Data Layer

### A1: Database engine and session management

As a developer, I want a configurable async database engine, so
that the app works with SQLite in development and can switch to
MySQL in production.

**Backend file:** `backend/db/engine.py`
**Backend test:** `backend/tests/test_db.py`

Uses SQLAlchemy async with aiosqlite. `config.py` gains a
`database_url` setting defaulting to
`sqlite+aiosqlite:///./gpu_booking.db`. An async session factory
`get_session` is provided as a FastAPI dependency.

Function signatures:

```python
async def init_db() -> None:
    """Create all tables. Called during app lifespan startup."""

async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding an async DB session."""
```

**Acceptance tests:**

1. Given a fresh in-memory SQLite database URL
   `sqlite+aiosqlite://`, when `init_db()` is called, then all
   tables (admins, gpu_types, workflow_types, gram_options,
   memory_options, bookings) exist in the database.

2. Given a configured engine, when `get_session()` is used as a
   dependency, then it yields an `AsyncSession` that can execute
   queries, and the session is closed after use.

3. Given the default config, when `database_url` is not set via
   env var, then it defaults to
   `sqlite+aiosqlite:///./gpu_booking.db`.

### A2: ORM models

As a developer, I want SQLAlchemy ORM models for all tables, so
that I can interact with the database using typed Python objects.

**Backend file:** `backend/db/models.py`
**Backend test:** `backend/tests/test_models.py`

Define ORM models for: Admin, GpuType, WorkflowType, GramOption,
MemoryOption, Booking. Use mapped_column with type annotations.

BookingStatus is a Python str enum with values: unconfirmed,
confirmed, tentative, spot, rejected, cancelled.

Booking model fields:

- id: int (primary key, autoincrement)
- user_email: str (not null)
- gpu_type_id: int (FK to gpu_types.id, not null)
- gpu_count: int (not null, > 0)
- gram_option_id: int (FK to gram_options.id, not null)
- memory_option_id: int (FK to memory_options.id, not null)
- workflow_type_id: int (FK to workflow_types.id, not null)
- start_date: date (not null)
- end_date: date (not null)
- status: BookingStatus (not null, default unconfirmed)
- alt_email: str (nullable)
- project_name: str (nullable)
- project_pi: str (nullable)
- project_grant_number: str (nullable)
- technical_lead: str (nullable)
- event_start_date: date (nullable)
- event_end_date: date (nullable)
- admin_notes: str (nullable)
- admin_modified_by: str (nullable)
- admin_modified_at: datetime (nullable)
- created_at: datetime (not null, server default utcnow)
- updated_at: datetime (not null, server default utcnow, onupdate)

GpuType: id, name (unique, not null), gram_gb (int, not null),
system_memory_gb (int, not null), total_count (int, not null),
created_at, updated_at.

WorkflowType: id, name (unique, not null), created_at, updated_at.

GramOption: id, label (str, not null), value_gb (int, not null),
sort_order (int, not null), created_at.

MemoryOption: id, label (str, not null), value_gb (int, not null),
sort_order (int, not null), created_at.

Admin: id, email (unique, not null), created_at.

**Acceptance tests:**

1. Given an in-memory database with tables created, when a
   Booking is inserted with all required fields and committed,
   then querying by id returns the booking with correct field
   values and status defaulting to "unconfirmed".

2. Given an in-memory database, when a GpuType with name "H100",
   gram_gb=80, system_memory_gb=500, total_count=40 is inserted,
   then querying by name returns the correct record.

3. Given an in-memory database with a GpuType, when a Booking is
   created referencing that gpu_type_id, then the foreign key
   relationship is valid and the booking can be queried with its
   GPU type.

4. Given an in-memory database, when a Booking is created without
   a required field (e.g. user_email is None), then the database
   raises an IntegrityError on commit.

5. Given an in-memory database, when two GpuTypes with the same
   name are inserted, then the database raises an IntegrityError
   due to the unique constraint.

6. Given an in-memory database, when a Booking is created with
   status not explicitly set, then the status defaults to
   "unconfirmed".

### A3: Database seeding

As a developer, I want initial seed data loaded on first startup,
so that the app has GPU types, workflow types, GRAM/memory
options, and admin users ready.

**Backend file:** `backend/db/seed.py`
**Backend test:** `backend/tests/test_seed.py`

```python
async def seed_db(session: AsyncSession) -> None:
    """Seed initial data if tables are empty.

    Only seeds each table if it has zero rows, making it
    idempotent across restarts.
    """
```

Seed data:

- GPU types: H200 (gram_gb=141, system_memory_gb=1000,
  total_count=24), H100 (gram_gb=80, system_memory_gb=500,
  total_count=16), A100 (gram_gb=80, system_memory_gb=500,
  total_count=0), V100 (gram_gb=32, system_memory_gb=192,
  total_count=0)
- Workflow types: "Inference workloads",
  "Interactive workloads",
  "HPC training, one server per task/job",
  "At scale training, span multiple GPU servers (> 8 GPUs)"
- GRAM options (label, value_gb, sort_order):
  ("80GB", 80, 1), ("60GB", 60, 2), ("40GB", 40, 3),
  ("<=20GB", 20, 4)
- Memory options (label, value_gb, sort_order):
  ("500GB", 500, 1), ("100GB", 100, 2), ("56GB", 56, 3),
  ("50GB", 50, 4), ("25GB", 25, 5), ("10GB", 10, 6),
  ("<10GB", 5, 7)
- Admin emails: from `INITIAL_ADMIN_EMAILS` env var
  (comma-separated), added to admins table.

**Acceptance tests:**

1. Given an empty database, when `seed_db()` is called, then
   gpu_types contains exactly 4 rows (H200, H100, A100, V100)
   with correct gram_gb, system_memory_gb, and total_count
   values.

2. Given an empty database, when `seed_db()` is called, then
   workflow_types contains exactly 4 rows matching the seed
   values.

3. Given an empty database, when `seed_db()` is called, then
   gram_options contains 4 rows and memory_options contains
   7 rows, each with correct label, value_gb, and sort_order.

4. Given `INITIAL_ADMIN_EMAILS=admin@example.com,boss@example.com`
   in the environment and an empty database, when `seed_db()`
   is called, then admins contains exactly 2 rows with those
   emails.

5. Given a database already containing GPU types, when
   `seed_db()` is called again, then no duplicate rows are
   created (idempotent).

6. Given `INITIAL_ADMIN_EMAILS` is not set, when `seed_db()` is
   called, then no admin rows are created and no error is raised.

---

## Section B: Authentication and Authorization

### B1: Auth configuration

As a developer, I want auth mode configurable via environment
variables, so that Okta OIDC is used in production and an
insecure mode is available for local testing.

**Backend file:** `backend/config.py`
**Backend test:** `backend/tests/test_config.py`

Add to the existing Settings class:

```python
# Auth
auth_mode: str = "insecure"  # "oidc" or "insecure"
okta_issuer: str = ""
okta_client_id: str = ""
okta_client_secret: str = ""
okta_audience: str = ""

# Database
database_url: str = "sqlite+aiosqlite:///./gpu_booking.db"

# Admin
initial_admin_emails: str = ""  # comma-separated
```

**Acceptance tests:**

1. Given no environment variables set, when Settings is
   instantiated, then `auth_mode` is "insecure",
   `database_url` is "sqlite+aiosqlite:///./gpu_booking.db",
   and `initial_admin_emails` is "".

2. Given `AUTH_MODE=oidc`, `OKTA_ISSUER=https://example.okta.com`,
   `OKTA_CLIENT_ID=abc`, `OKTA_CLIENT_SECRET=secret` set as env
   vars, when Settings is instantiated, then all fields have
   the correct values.

3. Given `INITIAL_ADMIN_EMAILS="a@b.com, c@d.com"`, when
   Settings is instantiated, then `initial_admin_emails`
   is "a@b.com, c@d.com" (parsing happens in seed.py, not
   config).

### B2: Auth middleware

As a developer, I want auth middleware that validates Okta OIDC
tokens in production or allows any user in insecure mode, so
that endpoints can check authentication and admin status.

**Backend file:** `backend/middleware/auth.py`
**Backend test:** `backend/tests/test_auth.py`

In insecure mode, requests include an `X-Dev-User` header with
the user's email. If absent, defaults to the first admin email
from config (or "dev@example.com").

In OIDC mode, validates the Bearer token from the Authorization
header against the Okta issuer. Extracts user email from token
claims.

```python
async def get_current_user(
    request: Request,
) -> UserInfo:
    """Extract current user from request.

    In insecure mode: reads X-Dev-User header.
    In OIDC mode: validates Bearer token.

    Returns UserInfo with email and is_admin flag.
    Raises HTTPException 401 if not authenticated.
    """

async def require_admin(
    user: Annotated[UserInfo, Depends(get_current_user)],
) -> UserInfo:
    """Dependency that requires admin privileges.

    Raises HTTPException 403 if user is not admin.
    """
```

**Acceptance tests:**

1. Given auth_mode is "insecure" and no X-Dev-User header, when
   `get_current_user` is called, then it returns a UserInfo with
   the default dev email and is_admin=True (first user in
   insecure mode is admin).

2. Given auth_mode is "insecure" and X-Dev-User header is
   "user@example.com" which is not in the admins table, when
   `get_current_user` is called, then it returns UserInfo with
   email="user@example.com" and is_admin=False.

3. Given auth_mode is "insecure" and X-Dev-User header is
   "admin@example.com" which IS in the admins table, when
   `get_current_user` is called, then it returns UserInfo with
   email="admin@example.com" and is_admin=True.

4. Given a non-admin UserInfo, when `require_admin` is called,
   then it raises HTTPException with status 403.

5. Given an admin UserInfo, when `require_admin` is called,
   then it returns the UserInfo without error.

6. Given auth_mode is "oidc" and no Authorization header, when
   `get_current_user` is called, then it raises HTTPException
   with status 401.

### B3: Auth endpoint and Zod contract

As a developer, I want a `/api/v1/auth/me` endpoint and matching
Zod schema, so that the frontend can check who is logged in
and whether they are admin.

**Backend file:** `backend/api/v1/auth.py`
**Backend test:** `backend/tests/test_auth_api.py`
**Frontend file:** `frontend/lib/auth-contracts.ts`
**Frontend test:** `frontend/tests/auth-contracts.test.ts`
**Server Action:** `frontend/app/actions.ts`

```python
@router.get("/auth/me", response_model=UserInfo)
async def get_me(
    user: Annotated[UserInfo, Depends(get_current_user)],
) -> UserInfo:
    """Return current user info."""
```

Zod schema:

```typescript
export const userInfoSchema = z.object({
  email: z.string().email(),
  is_admin: z.boolean(),
  auth_mode: z.enum(["oidc", "insecure"]),
});
export type UserInfo = z.infer<typeof userInfoSchema>;
```

Server Action:

```typescript
export async function getCurrentUser(): Promise<UserInfo> {
  return backendJson("/api/v1/auth/me", userInfoSchema);
}
```

**Acceptance tests:**

1. Given auth_mode is "insecure" and no X-Dev-User header, when
   GET /api/v1/auth/me is called, then response status is 200
   and body contains `{"email": "...", "is_admin": true,
   "auth_mode": "insecure"}`.

2. Given auth_mode is "insecure" and X-Dev-User is
   "user@example.com" who is not admin, when GET /api/v1/auth/me
   is called, then response contains is_admin=false.

3. Given the `userInfoSchema` Zod schema and payload
   `{"email": "a@b.com", "is_admin": true,
   "auth_mode": "insecure"}`, when `.parse()` is called, then
   it succeeds.

4. Given the `userInfoSchema` Zod schema and payload
   `{"email": "a@b.com"}` (missing fields), when
   `.safeParse()` is called, then `result.success` is false.

5. Given the `userInfoSchema` Zod schema and payload
   `{"email": "not-an-email", "is_admin": true,
   "auth_mode": "insecure"}`, when `.safeParse()` is called,
   then `result.success` is false.

### B4: Frontend auth provider and user switch

As a user, I want the app to show my identity and admin status,
and in dev mode I want a dropdown to switch between users, so
that I can test both admin and non-admin flows.

**Frontend file:** `frontend/components/auth-provider.tsx`
**Frontend file:** `frontend/components/user-switch.tsx`
**Frontend file:** `frontend/lib/auth-state.ts`
**Frontend test:** `frontend/tests/auth-contracts.test.ts`

The AuthProvider is a Client Component using React context.
It calls the `getCurrentUser` Server Action on mount and
provides the user info to children.

UserSwitch is a Client Component shown only in insecure auth
mode. It is a dropdown in the top nav that lets the user type
an email address and select admin/non-admin for testing. Changing
the selection re-fetches with the new X-Dev-User header value.

**Acceptance tests:**

1. Given auth_mode is "insecure", when the app loads, then the
   UserSwitch dropdown is visible in the navigation.

2. Given auth_mode is "oidc", when the app loads, then the
   UserSwitch dropdown is NOT rendered.

3. Given the UserSwitch is visible, when a user types
   "testuser@example.com" and submits, then subsequent API
   calls use that email as the authenticated user.

4. Given the AuthProvider wraps the app, when the user is
   authenticated, then all child components can access
   `useAuth()` returning `{email, isAdmin, authMode}`.

## Section C: Admin Configuration Management

### C1: GPU type management endpoints

As an admin, I want API endpoints to list, create, and update
GPU types, so that I can configure available GPU resources.

**Backend file:** `backend/api/v1/admin.py`
**Backend test:** `backend/tests/test_admin_api.py`
**Frontend file:** `frontend/lib/admin-contracts.ts`
**Frontend test:** `frontend/tests/admin-contracts.test.ts`

Endpoints (all under admin router except GET which is public):
- `GET /api/v1/gpu-types` - list all GPU types, any user
- `POST /api/v1/admin/gpu-types` - create, admin only
- `PUT /api/v1/admin/gpu-types/{id}` - update, admin only

Public endpoint on a separate reference data router since
non-admins need it for forms.

Pydantic models (already defined in schemas.py):
- GpuTypeResponse: id, name, gram_gb, system_memory_gb,
  total_count, created_at, updated_at
- GpuTypeCreate: name, gram_gb (gt=0), system_memory_gb (gt=0),
  total_count (gt=0)
- GpuTypeUpdate: all fields optional

Zod schema:
```typescript
export const gpuTypeSchema = z.object({
  id: z.number(),
  name: z.string(),
  gram_gb: z.number(),
  system_memory_gb: z.number(),
  total_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type GpuType = z.infer<typeof gpuTypeSchema>;

export const gpuTypeListSchema = z.array(gpuTypeSchema);
```

**Acceptance tests:**

1. Given a seeded database with 4 GPU types, when
   GET /api/v1/gpu-types is called by any user, then response
   status is 200 and body contains 4 items with correct fields.

2. Given admin auth, when POST /api/v1/admin/gpu-types is called
   with `{"name": "H200", "gram_gb": 141, "system_memory_gb":
   1000, "total_count": 60}`, then response status is 201 and
   body contains the new GPU type with id assigned.

3. Given admin auth and an existing GPU type with id=1, when
   PUT /api/v1/admin/gpu-types/1 with `{"total_count": 50}` is
   called, then response status is 200 and total_count is
   updated to 50.

4. Given non-admin auth, when POST /api/v1/admin/gpu-types is
   called, then response status is 403.

5. Given admin auth, when POST /api/v1/admin/gpu-types with a
   duplicate name is called, then response status is 409 with
   a conflict error.

6. Given the `gpuTypeSchema` Zod schema and a valid payload,
   when `.parse()` is called, then it succeeds.

7. Given the `gpuTypeSchema` and a payload missing `name`, when
   `.safeParse()` is called, then `result.success` is false.

### C2: Workflow type management endpoints

As an admin, I want API endpoints to list, create, update, and
delete workflow types, so that I can configure the available
workflow options for booking forms.

**Backend file:** `backend/api/v1/admin.py`
**Backend test:** `backend/tests/test_admin_api.py`
**Frontend file:** `frontend/lib/admin-contracts.ts`
**Frontend test:** `frontend/tests/admin-contracts.test.ts`

Endpoints:
- `GET /api/v1/workflow-types` - list all, any user
- `POST /api/v1/admin/workflow-types` - create, admin only
- `PUT /api/v1/admin/workflow-types/{id}` - update, admin only
- `DELETE /api/v1/admin/workflow-types/{id}` - delete, admin
  only (fails if any booking references it)

Zod schema:
```typescript
export const workflowTypeSchema = z.object({
  id: z.number(),
  name: z.string(),
});
export type WorkflowType = z.infer<typeof workflowTypeSchema>;

export const workflowTypeListSchema =
  z.array(workflowTypeSchema);
```

**Acceptance tests:**

1. Given a seeded database with 4 workflow types, when
   GET /api/v1/workflow-types is called, then response status
   is 200 and body contains 4 items.

2. Given admin auth, when POST /api/v1/admin/workflow-types
   with `{"name": "Fine-tuning"}` is called, then response
   status is 201.

3. Given admin auth and workflow type id=1 with name
   "Inference workloads", when PUT with
   `{"name": "Inference (GPU)"}` is called, then response
   status is 200 and name is updated.

4. Given admin auth and a workflow type not referenced by any
   booking, when DELETE /api/v1/admin/workflow-types/{id} is
   called, then response status is 204.

5. Given admin auth and a workflow type referenced by an
   existing booking, when DELETE is called, then response
   status is 409 with an error explaining it is in use.

6. Given non-admin auth, when POST /api/v1/admin/workflow-types
   is called, then response status is 403.

### C3: GRAM option management endpoints

As an admin, I want API endpoints to manage GRAM options, so
that I can configure memory choices available in booking forms.

**Backend file:** `backend/api/v1/admin.py`
**Backend test:** `backend/tests/test_admin_api.py`
**Frontend file:** `frontend/lib/admin-contracts.ts`
**Frontend test:** `frontend/tests/admin-contracts.test.ts`

Endpoints:
- `GET /api/v1/gram-options` - list all, any user, ordered by
  sort_order
- `POST /api/v1/admin/gram-options` - create, admin only
- `PUT /api/v1/admin/gram-options/{id}` - update, admin only
- `DELETE /api/v1/admin/gram-options/{id}` - delete, admin only
  (fails if any booking references it)

Pydantic: GramOptionResponse (id, label, value_gb, sort_order)
Pydantic: GramOptionCreate (label, value_gb, sort_order)

Zod schema:
```typescript
export const gramOptionSchema = z.object({
  id: z.number(),
  label: z.string(),
  value_gb: z.number(),
  sort_order: z.number(),
});
export type GramOption = z.infer<typeof gramOptionSchema>;

export const gramOptionListSchema = z.array(gramOptionSchema);
```

**Acceptance tests:**

1. Given a seeded database with 4 GRAM options, when
   GET /api/v1/gram-options is called, then response contains
   4 items ordered by sort_order ascending.

2. Given admin auth, when POST /api/v1/admin/gram-options with
   `{"label": "160GB", "value_gb": 160, "sort_order": 0}` is
   called, then response status is 201.

3. Given admin auth and a GRAM option not referenced by any
   booking, when DELETE is called, then response status is 204.

4. Given admin auth and a GRAM option referenced by a booking,
   when DELETE is called, then response status is 409.

5. Given the `gramOptionSchema` and a valid payload, when
   `.parse()` is called, then it succeeds.

### C4: System memory option management endpoints

As an admin, I want API endpoints to manage system memory
options, so that I can configure memory choices in booking forms.

**Backend file:** `backend/api/v1/admin.py`
**Backend test:** `backend/tests/test_admin_api.py`
**Frontend file:** `frontend/lib/admin-contracts.ts`
**Frontend test:** `frontend/tests/admin-contracts.test.ts`

Endpoints:
- `GET /api/v1/memory-options` - list all, any user, ordered by
  sort_order
- `POST /api/v1/admin/memory-options` - create, admin only
- `PUT /api/v1/admin/memory-options/{id}` - update, admin only
- `DELETE /api/v1/admin/memory-options/{id}` - delete, admin
  (fails if referenced)

Zod schema:
```typescript
export const memoryOptionSchema = z.object({
  id: z.number(),
  label: z.string(),
  value_gb: z.number(),
  sort_order: z.number(),
});
export type MemoryOption = z.infer<typeof memoryOptionSchema>;

export const memoryOptionListSchema =
  z.array(memoryOptionSchema);
```

**Acceptance tests:**

1. Given a seeded database with 7 memory options, when
   GET /api/v1/memory-options is called, then response contains
   7 items ordered by sort_order.

2. Given admin auth, when POST /api/v1/admin/memory-options with
   `{"label": "1TB", "value_gb": 1000, "sort_order": 0}` is
   called, then response status is 201.

3. Given admin auth and a memory option not referenced by any
   booking, when DELETE is called, then response status is 204.

4. Given admin auth and a memory option referenced by a booking,
   when DELETE is called, then response status is 409.

### C5: Admin GPU type config UI

As an admin, I want a web page to manage GPU types (view, add,
edit), so that I can configure capacity without using the API
directly.

**Frontend file:** `frontend/app/admin/gpu-types/page.tsx`
**Frontend file:** `frontend/components/gpu-type-manager.tsx`
**Server Action additions:** `frontend/app/actions.ts`

The page lists existing GPU types in a table with columns:
Name, GRAM (GB), System Memory (GB), Total Count, Actions.
An "Add GPU Type" button opens an inline form. Each row has an
"Edit" button for inline editing. Uses `useActionState` for form
submissions calling Server Actions that proxy to admin endpoints.

Server Actions:
```typescript
export async function getGpuTypes(): Promise<GpuType[]>
export async function createGpuType(
  prev: FormState, formData: FormData
): Promise<FormState>
export async function updateGpuType(
  prev: FormState, formData: FormData
): Promise<FormState>
```

**Acceptance tests:**

1. Given admin auth and 4 seeded GPU types, when the admin
   visits /admin/gpu-types, then a table displays 4 rows with
   H200, H100, A100, V100 and their specs.

2. Given admin auth, when the admin fills in the "Add GPU Type"
   form with name="L40", gram_gb=48, system_memory_gb=256,
   total_count=8 and submits, then the table updates to show
   5 rows including L40.

3. Given admin auth, when the admin clicks "Edit" on H100 and
   changes total_count to 50 and saves, then the table shows
   total_count=50 for H100.

4. Given non-admin auth, when the user navigates to
   /admin/gpu-types, then they are shown an "access denied"
   message or redirected.

### C6: Admin workflow type config UI

As an admin, I want a web page to manage workflow types, so that
I can add, edit, or remove workflow options.

**Frontend file:** `frontend/app/admin/workflow-types/page.tsx`
**Frontend file:**
  `frontend/components/workflow-type-manager.tsx`

Similar structure to C5. Table with Name and Actions columns.
Add, edit, delete buttons.

**Acceptance tests:**

1. Given admin auth and 4 seeded workflow types, when admin
   visits /admin/workflow-types, then 4 rows are displayed.

2. Given admin auth, when "Add" form is filled with
   name="Fine-tuning" and submitted, then 5 rows are shown.

3. Given admin auth and a workflow type not in use, when admin
   clicks delete and confirms, then it is removed from the
   list.

4. Given admin auth and a workflow type in use by a booking,
   when admin clicks delete, then an error toast is shown.

### C7: Admin GRAM and memory options config UI

As an admin, I want a web page to manage GRAM and system memory
options, so that I can configure dropdown choices for booking
forms.

**Frontend file:** `frontend/app/admin/memory-options/page.tsx`
**Frontend file:**
  `frontend/components/memory-option-manager.tsx`

Page has two sections: GRAM Options and System Memory Options.
Each section has a table (Label, Value GB, Sort Order, Actions)
with add, edit, delete. Design note: the GRAM/memory feature
should be toggleable in the future so these options can be
auto-calculated from GPU count instead.

**Acceptance tests:**

1. Given admin auth, when admin visits /admin/memory-options,
   then both GRAM and Memory sections are displayed with seeded
   data (4 GRAM options, 7 memory options).

2. Given admin auth, when a new GRAM option is added with
   label="160GB", value_gb=160, sort_order=0, then the GRAM
   table updates to show 5 rows.

3. Given admin auth and a GRAM option not in use, when deleted,
   then it is removed from the table.

---

## Section D: Booking CRUD

### D1: Booking creation endpoint with validation

As a user, I want to create a GPU booking via the API, so that
I can request GPU resources for a specific time period.

**Backend file:** `backend/api/v1/bookings.py`
**Backend file:** `backend/services/booking_service.py`
**Backend test:** `backend/tests/test_booking_api.py`

```python
@router.post("/bookings", response_model=BookingResponse,
             status_code=201)
async def create_booking(
    booking: BookingCreate,
    user: Annotated[UserInfo, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> BookingResponse:
    """Create a new booking.

    Validates:
    - start_date <= end_date
    - start_date is in the future
    - gpu_type_id, gram_option_id, memory_option_id,
      workflow_type_id all reference valid records
    - gpu_count > 0

    Generates warnings (included in response) for:
    - Duration > 14 days
    - Less than 2 weeks advance notice
    - User would exceed 40% of total capacity for any GPU type
      on any day of the booking

    Blocks (returns 409) if:
    - Total confirmed+tentative+spot bookings would exceed 100%
      capacity for the requested GPU type on any day
    """
```

Booking service function:
```python
async def create_booking(
    session: AsyncSession,
    user_email: str,
    data: BookingCreate,
) -> tuple[Booking, list[CapacityWarning]]:
    """Create booking and return it with any warnings."""
```

The response includes a `warnings` field listing any soft
warning messages.

Bookings use UK local time (Europe/London), whole days only.
Reservations cover start_date through end_date inclusive (ending
at midnight after end_date).

**Acceptance tests:**

1. Given a valid BookingCreate with start_date 30 days from now
   and end_date 33 days from now, gpu_type_id referring to H100
   (total=40), gpu_count=4, when POST /api/v1/bookings is
   called, then response status is 201, the booking has status
   "unconfirmed", and warnings is an empty list.

2. Given start_date is in the past, when POST /api/v1/bookings
   is called, then response status is 400 with detail
   "Start date must be in the future".

3. Given start_date > end_date, when POST is called, then
   response status is 400 with detail
   "Start date must be before end date".

4. Given gpu_type_id that does not exist, when POST is called,
   then response status is 404 with detail
   "GPU type not found".

5. Given a booking with duration of 15 days, when POST is
   called, then response status is 201 and warnings contains
   a message about exceeding 14-day maximum duration.

6. Given a booking with start_date 5 days from now (less than
   14 days advance), when POST is called, then response status
   is 201 and warnings contains a message about insufficient
   advance notice.

7. Given existing confirmed bookings totaling 38 out of 40 H100
   GPUs on a given day, when a new booking for 3 H100 GPUs
   overlapping that day is created, then response status is 409
   with block_reason indicating 100% capacity exceeded.

8. Given a user already has confirmed bookings using 15 out of
   40 H100 GPUs on a given day (37.5%), when they create a new
   booking for 2 more H100 GPUs (total 42.5%), then response
   status is 201 and warnings contains a message about
   exceeding 40% per-user capacity.

9. Given gpu_count is 0 or negative, when POST is called, then
   response status is 422 (Pydantic validation).

10. Given a valid booking with all optional fields filled
    (alt_email, project_name, project_pi,
    project_grant_number, technical_lead, event_start_date,
    event_end_date), when POST is called, then response status
    is 201 and all optional fields are returned in the
    response.

11. Given start_date equals end_date (single-day booking),
    when POST /api/v1/bookings is called, then response
    status is 201 (single-day booking is valid).

### D2: Booking list endpoint

As a user, I want to list bookings with optional filters, so
that I can see existing reservations.

**Backend file:** `backend/api/v1/bookings.py`
**Backend test:** `backend/tests/test_booking_api.py`

```python
@router.get("/bookings",
            response_model=list[BookingResponse])
async def list_bookings(
    user: Annotated[UserInfo, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    start_date: date | None = None,
    end_date: date | None = None,
    gpu_type_id: int | None = None,
    status: BookingStatus | None = None,
) -> list[BookingResponse]:
    """List bookings with optional filters.

    Filters by date range overlap: any booking whose
    [start_date, end_date] overlaps [query start, query end].
    admin_notes field is only populated if user is admin.
    """
```

**Acceptance tests:**

1. Given 5 bookings in the database, when GET /api/v1/bookings
   is called with no filters, then response status is 200 and
   body contains 5 items.

2. Given bookings spanning various dates, when filtered by
   start_date=2026-03-01 and end_date=2026-03-15, then only
   bookings overlapping that range are returned.

3. Given bookings for H100 and A100, when filtered by
   gpu_type_id for H100, then only H100 bookings are returned.

4. Given bookings with various statuses, when filtered by
   status=confirmed, then only confirmed bookings are returned.

5. Given a non-admin user, when listing bookings, then
   admin_notes is null in all responses.

6. Given an admin user, when listing bookings that have
   admin_notes, then admin_notes is populated in responses.

### D3: Booking cancellation endpoint

As a user, I want to cancel my own booking, so that GPU
resources are freed for others.

**Backend file:** `backend/api/v1/bookings.py`
**Backend test:** `backend/tests/test_booking_api.py`

```python
@router.delete("/bookings/{booking_id}",
               status_code=200,
               response_model=BookingResponse)
async def cancel_booking(
    booking_id: int,
    user: Annotated[UserInfo, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> BookingResponse:
    """Cancel a booking.

    - Owner can cancel their own booking.
    - If booking has never been admin-edited
      (admin_modified_at is null), DELETE permanently removes
      it and returns the deleted booking with 200.
    - If booking has been admin-edited, sets status to
      "cancelled" and returns it.
    - Non-owner, non-admin gets 403.
    - Admin can also cancel any booking (sets to cancelled).
    """
```

**Acceptance tests:**

1. Given user "a@b.com" owns a booking with status
   "unconfirmed" and admin_modified_at is null, when DELETE
   /api/v1/bookings/{id} is called by "a@b.com", then response
   status is 200, the booking data is returned, and the booking
   no longer exists in the database.

2. Given user "a@b.com" owns a booking with status "confirmed"
   (admin has modified it, admin_modified_at is set), when
   DELETE is called by "a@b.com", then response status is 200,
   and the booking status is changed to "cancelled".

3. Given user "other@b.com" does NOT own the booking and is not
   admin, when DELETE is called, then response status is 403.

4. Given an admin user, when DELETE is called on any booking
   that has been admin-edited, then the booking status is set
   to "cancelled".

5. Given a booking with id=999 that does not exist, when DELETE
   is called, then response status is 404.

6. Given an admin user and a booking with admin_modified_at=null
   owned by another user, when DELETE /api/v1/bookings/{id} is
   called by the admin, then the booking status is set to
   'cancelled' (not permanently deleted, because admin cancel
   always sets cancelled status).

### D4: Booking Zod contracts

As a developer, I want Zod schemas matching all booking Pydantic
models, so that frontend-backend contracts are validated at
runtime.

**Frontend file:** `frontend/lib/booking-contracts.ts`
**Frontend test:** `frontend/tests/booking-contracts.test.ts`

```typescript
export const bookingStatusSchema = z.enum([
  "unconfirmed", "confirmed", "tentative",
  "spot", "rejected", "cancelled",
]);

export const bookingResponseSchema = z.object({
  id: z.number(),
  user_email: z.string(),
  gpu_type_id: z.number(),
  gpu_type_name: z.string(),
  gpu_count: z.number(),
  gram_option_id: z.number(),
  gram_label: z.string(),
  memory_option_id: z.number(),
  memory_label: z.string(),
  workflow_type_id: z.number(),
  workflow_type_name: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  status: bookingStatusSchema,
  alt_email: z.string().nullable(),
  project_name: z.string().nullable(),
  project_pi: z.string().nullable(),
  project_grant_number: z.string().nullable(),
  technical_lead: z.string().nullable(),
  event_start_date: z.string().nullable(),
  event_end_date: z.string().nullable(),
  admin_notes: z.string().nullable(),
  admin_modified_by: z.string().nullable(),
  admin_modified_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  warnings: z.array(z.string()),
});
export type BookingResponse =
  z.infer<typeof bookingResponseSchema>;

export const bookingListSchema =
  z.array(bookingResponseSchema);
```

**Acceptance tests:**

1. Given a valid BookingResponse payload with all fields, when
   `bookingResponseSchema.parse()` is called, then it succeeds.

2. Given a payload with status="invalid_status", when
   `.safeParse()` is called, then `result.success` is false.

3. Given a payload missing required field `gpu_count`, when
   `.safeParse()` is called, then `result.success` is false.

4. Given a payload with nullable fields set to null (alt_email,
   project_name, etc.), when `.parse()` is called, then it
   succeeds.

5. Given a valid array of BookingResponse objects, when
   `bookingListSchema.parse()` is called, then it succeeds.

6. Given an empty array, when `bookingListSchema.parse()` is
   called, then it succeeds (empty is valid).

## Section E: Capacity Validation

### E1: Capacity calculation service

As a developer, I want a capacity calculation service, so that
booking creation and the calendar view can determine available
GPU resources per day.

**Backend file:** `backend/services/capacity_service.py`
**Backend test:** `backend/tests/test_capacity_service.py`

```python
async def get_daily_capacity(
    session: AsyncSession,
    start_date: date,
    end_date: date,
    gpu_type_id: int | None = None,
    user_email: str | None = None,
) -> list[DailyCapacity]:
    """Calculate capacity per day for a date range.

    For each day in [start_date, end_date] and each GPU type
    (or a specific gpu_type_id):
    - total: gpu_type.total_count
    - confirmed_used: sum of gpu_count for bookings with status
      in (confirmed, tentative, spot) overlapping that day
    - pending_used: sum of gpu_count for bookings with status
      unconfirmed overlapping that day
    - available: total - confirmed_used
    - user_used: sum of gpu_count for bookings by user_email
      with status in (confirmed, tentative, spot, unconfirmed)
      overlapping that day (across ALL gpu types)
    - user_percent: (user_used / sum of all gpu_type.total_count)
      * 100

    A booking overlaps a day if booking.start_date <= day <=
    booking.end_date.
    """

async def validate_booking(
    session: AsyncSession,
    user_email: str,
    gpu_type_id: int,
    gpu_count: int,
    start_date: date,
    end_date: date,
    exclude_booking_id: int | None = None,
) -> BookingValidation:
    """Validate a proposed booking against capacity rules.

    Returns BookingValidation with:
    - warnings for: duration > 14 days, < 14 days advance
      notice, user > 40% of total capacity on any day
    - blocked=True if confirmed_used + gpu_count > total for
      the requested GPU type on any day in the range
    - exclude_booking_id allows excluding the booking being
      edited (for admin edits)

    The 40% rule: sum user's bookings across ALL GPU types
    (including the proposed one) for each day. If that sum
    exceeds 40% of the total capacity across all GPU types,
    generate a warning. Total capacity = sum of total_count
    across all GPU types.

    The 100% block: for the specific GPU type requested, if
    confirmed_used (confirmed + tentative + spot, excluding
    unconfirmed) + new gpu_count > gpu_type.total_count on any
    day, block the booking.
    """
```

**Acceptance tests:**

1. Given GPU type H100 with total_count=40 and no bookings,
   when `get_daily_capacity` is called for 2026-04-01 to
   2026-04-03, then each day shows total=40, confirmed_used=0,
   pending_used=0, available=40.

2. Given H100 total=40 and a confirmed booking for 10 GPUs on
   2026-04-01 to 2026-04-02, when `get_daily_capacity` is
   called for 2026-04-01 to 2026-04-03, then 04-01 and 04-02
   show confirmed_used=10, available=30, and 04-03 shows
   confirmed_used=0, available=40.

3. Given H100 total=40 and an unconfirmed booking for 5 GPUs
   on 2026-04-01, when `get_daily_capacity` is called, then
   04-01 shows pending_used=5, confirmed_used=0, available=40
   (pending does not reduce available).

4. Given H100 total=40, a spot booking for 5 GPUs and a
   tentative booking for 3 GPUs on 2026-04-01, when
   `get_daily_capacity` is called, then confirmed_used=8,
   available=32 (spot and tentative count as confirmed).

5. Given a user with no bookings proposing 4 H100 GPUs for 3
   days starting 30 days from now, when `validate_booking` is
   called, then valid=True, warnings=[], blocked=False.

6. Given existing confirmed bookings totaling 38 H100 GPUs on
   2026-04-01, when `validate_booking` is called for 3 more
   H100 GPUs on that day, then blocked=True with block_reason
   mentioning 100% capacity exceeded.

7. Given total capacity across all GPU types is 80 (H100=40,
   A100=40), and a user has confirmed bookings of 20 H100 GPUs
   on 2026-04-01, when they propose 14 A100 GPUs on the same
   day (total user = 34, which is 42.5%), then valid=True,
   blocked=False, but warnings contains a message about
   exceeding 40% per-user capacity.

8. Given a booking with duration of 15 days, when
   `validate_booking` is called, then warnings contains
   "Booking duration exceeds 14-day maximum".

9. Given a booking starting 5 days from now, when
   `validate_booking` is called, then warnings contains
   "Less than 2 weeks advance notice".

10. Given a booking starting 14 days from now exactly, when
    `validate_booking` is called, then no advance notice
    warning is generated (14 days is acceptable).

11. Given a booking with duration of exactly 14 days, when
    `validate_booking` is called, then no duration warning
    is generated (14 days is the maximum allowed).

12. Given existing confirmed bookings totaling 40 H100 GPUs
    (100%) on a day, when `validate_booking` is called for
    1 more H100 GPU, then blocked=True.

13. Given exclude_booking_id is set to an existing booking's
    id that uses 5 H100 GPUs, and confirmed_used without
    that booking is 34, when `validate_booking` is called for
    5 H100 GPUs, then blocked=False (34 + 5 = 39 <= 40).

### E2: Capacity endpoint

As a user, I want an API endpoint to get daily capacity data,
so that the calendar view can show available resources.

**Backend file:** `backend/api/v1/capacity.py`
**Backend test:** `backend/tests/test_capacity_api.py`
**Frontend file:** `frontend/lib/booking-contracts.ts`
**Frontend test:** `frontend/tests/booking-contracts.test.ts`

```python
@router.get("/capacity", response_model=list[DailyCapacity])
async def get_capacity(
    user: Annotated[UserInfo, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    start_date: date,
    end_date: date,
    gpu_type_id: int | None = None,
) -> list[DailyCapacity]:
    """Get daily capacity for a date range."""
```

Zod schema:

```typescript
export const dailyCapacitySchema = z.object({
  date: z.string(),
  gpu_type_id: z.number(),
  gpu_type_name: z.string(),
  total: z.number(),
  confirmed_used: z.number(),
  pending_used: z.number(),
  available: z.number(),
  user_used: z.number(),
  user_percent: z.number(),
  warnings: z.array(z.string()),
});
export type DailyCapacity =
  z.infer<typeof dailyCapacitySchema>;

export const dailyCapacityListSchema =
  z.array(dailyCapacitySchema);
```

**Acceptance tests:**

1. Given bookings exist, when GET /api/v1/capacity with
   start_date and end_date covering them is called, then
   response status is 200 and body is a list of DailyCapacity
   objects.

2. Given no bookings, when GET /api/v1/capacity is called for a
   date range with gpu_type_id for H100, then each day shows
   total=40 (or whatever H100's total_count is), confirmed_used
   =0, available=40.

3. Given start_date is missing, when GET /api/v1/capacity is
   called, then response status is 422.

4. Given the `dailyCapacitySchema` and a valid payload, when
   `.parse()` is called, then it succeeds.

5. Given the `dailyCapacitySchema` and a payload missing
   `total`, when `.safeParse()` is called, then
   `result.success` is false.

### E3: Booking validation endpoint

As a user, I want to preview validation warnings before
submitting a booking, so that I can see capacity issues.

**Backend file:** `backend/api/v1/capacity.py`
**Backend test:** `backend/tests/test_capacity_api.py`
**Frontend file:** `frontend/lib/booking-contracts.ts`
**Frontend test:** `frontend/tests/booking-contracts.test.ts`

```python
@router.post("/capacity/validate",
             response_model=BookingValidation)
async def validate_booking_request(
    booking: BookingCreate,
    user: Annotated[UserInfo, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> BookingValidation:
    """Preview validation for a proposed booking."""
```

Zod schemas:

```typescript
export const capacityWarningSchema = z.object({
  rule: z.string(),
  message: z.string(),
  severity: z.enum(["warning", "block"]),
});

export const bookingValidationSchema = z.object({
  valid: z.boolean(),
  warnings: z.array(capacityWarningSchema),
  blocked: z.boolean(),
  block_reason: z.string().nullable(),
});
export type BookingValidation =
  z.infer<typeof bookingValidationSchema>;
```

**Acceptance tests:**

1. Given a valid proposed booking within all rules, when
   POST /api/v1/capacity/validate is called, then response
   shows valid=true, blocked=false, warnings=[].

2. Given a proposed booking that would exceed 100% capacity,
   when POST /api/v1/capacity/validate is called, then
   blocked=true with a block_reason.

3. Given the `bookingValidationSchema` and a valid payload,
   when `.parse()` is called, then it succeeds.

4. Given the `capacityWarningSchema` and payload
   `{"rule": "duration", "message": "too long",
   "severity": "warning"}`, when `.parse()` is called, then
   it succeeds.

---

## Section F: Calendar View

### F1: Calendar page and monthly grid

As a user, I want a monthly calendar view showing GPU bookings,
so that I can visually assess availability before booking.

**Frontend file:** `frontend/app/bookings/page.tsx`
**Frontend file:** `frontend/components/calendar-view.tsx`
**Frontend file:** `frontend/components/capacity-bar.tsx`
**Server Action:** `frontend/app/actions.ts`

The bookings page has two tabs: Calendar and Table.

The calendar shows a traditional monthly grid (7 columns for
days of the week, rows for weeks). Each day cell contains:

- A capacity bar showing % of total GPU capacity booked
- Color coding: green for confirmed (confirmed + tentative +
  spot), yellow/amber for pending (unconfirmed)
- The capacity bar is stacked: confirmed portion in solid,
  pending portion in hatched/striped pattern
- If total usage > 80%, the day cell background is tinted

Navigation: previous/next month buttons, "Today" button.

A GPU type filter dropdown (default: "All GPU types") filters
the capacity display to a specific GPU type.

Server Actions:

```typescript
export async function getCapacity(
  startDate: string,
  endDate: string,
  gpuTypeId?: number,
): Promise<DailyCapacity[]>

export async function getBookings(
  startDate?: string,
  endDate?: string,
  gpuTypeId?: number,
  status?: string,
): Promise<BookingResponse[]>
```

**Acceptance tests:**

1. Given the current month is March 2026 with some bookings,
   when the user visits /bookings, then a monthly calendar
   grid is displayed showing capacity bars on booked days.

2. Given a day with 20 out of 40 H100 GPUs confirmed booked,
   when viewing "All GPU types", then the day's capacity bar
   shows 50% filled in solid green.

3. Given a day with 15 confirmed and 5 unconfirmed bookings
   (out of 40), when viewing, then the capacity bar shows
   37.5% solid (confirmed) and 12.5% hatched (pending).

4. Given the user clicks "Previous Month", then the calendar
   navigates to the previous month and reloads capacity data.

5. Given the GPU type filter is changed to "H100", then
   capacity bars update to show only H100 bookings.

6. Given no bookings exist for a month, then all day cells
   show empty capacity bars (0%).

### F2: Calendar booking creation interaction

As a user, I want to double-click a day or drag across days on
the calendar to start creating a booking, so that date selection
is intuitive.

**Frontend file:** `frontend/components/calendar-view.tsx`
**Frontend file:** `frontend/app/bookings/new/page.tsx`
**Frontend file:** `frontend/components/booking-form.tsx`

Double-clicking a day opens the booking form with that date as
start_date (and end_date = start_date for a single day).
Clicking and dragging across multiple days sets start_date and
end_date to the range. The booking form can also be opened via
a "New Booking" button without pre-filled dates.

The booking form page (/bookings/new) accepts optional query
params: ?start=YYYY-MM-DD&end=YYYY-MM-DD

**Acceptance tests:**

1. Given the calendar is displayed, when the user double-clicks
   on March 15, then the booking form opens with start_date
   =2026-03-15 and end_date=2026-03-15.

2. Given the calendar is displayed, when the user clicks on
   March 10 and drags to March 14, then the booking form opens
   with start_date=2026-03-10 and end_date=2026-03-14.

3. Given the user clicks "New Booking" button, then the booking
   form opens with no pre-filled dates.

4. Given the booking form is opened via URL
   /bookings/new?start=2026-04-01&end=2026-04-05, then the
   start_date and end_date fields are pre-populated.

### F3: Booking creation form

As a user, I want a form to create a GPU booking with all
required and optional fields, so that I can request resources.

**Frontend file:** `frontend/components/booking-form.tsx`
**Frontend file:** `frontend/lib/booking-state.ts`
**Server Action:** `frontend/app/actions.ts`

The form includes:

- GPU Type: dropdown (required, populated from GET /gpu-types)
- Number of GPUs: number input (required, > 0)
- GRAM: dropdown (required, from GET /gram-options)
- System Memory: dropdown (required, from GET /memory-options)
- Workflow Type: dropdown (required, from GET /workflow-types)
- Start Date: date picker (required)
- End Date: date picker (required)
- Alternate Email: text input (optional)
- Project Name: text input (optional)
- Project PI/Lead: text input (optional)
- Project or Grant Number: text input (optional)
- Technical Lead: text input (optional)
- Event Start Date: date picker (optional, for external event)
- Event End Date: date picker (optional, for external event)

A "Validate" button calls the validation endpoint and shows
warnings/blocks before submission. Warnings show as yellow
alerts. Blocks show as red alerts and disable the submit
button.

Uses `useActionState` with BookingFormState type.

Server Action:

```typescript
export async function createBooking(
  prev: BookingFormState,
  formData: FormData,
): Promise<BookingFormState>
```

**Acceptance tests:**

1. Given the form is shown, when all required fields are filled
   and submitted, then a booking is created and the user is
   redirected to /bookings with a success toast.

2. Given required fields are missing, when submit is clicked,
   then client-side validation shows error messages on the
   missing fields.

3. Given the "Validate" button is clicked with valid data, when
   the server returns no warnings, then a green "No issues
   found" message is shown.

4. Given the "Validate" button is clicked, when the server
   returns warnings (e.g. duration > 14 days), then yellow
   warning alerts are displayed but submit remains enabled.

5. Given the "Validate" button is clicked, when the server
   returns blocked=true, then a red block alert is displayed
   and the submit button is disabled.

6. Given all optional fields are filled, when submitted, then
   the booking is created with all optional fields saved.

7. Given the form is pre-populated with start and end dates
   from URL params, when displayed, then the date fields show
   the correct values.

## Section G: Booking Table View

### G1: Booking table component

As a user, I want a table view of bookings with sorting,
filtering, and searching, so that I can find specific bookings
quickly.

**Frontend file:** `frontend/components/booking-table.tsx`
**Frontend file:** `frontend/app/bookings/page.tsx`

The table view is the second tab on the /bookings page
(alongside the calendar view). It shows all bookings in a
table with these columns:

- Status (with color badge: green=confirmed, yellow=pending,
  blue=tentative, orange=spot, red=rejected, grey=cancelled)
- User Email
- GPU Type
- GPU Count
- Start Date
- End Date
- Workflow Type
- Project Name
- Created At

Features:

- Click column headers to sort (ascending/descending toggle)
- Text search box filters across all text columns
- Dropdown filters for: Status, GPU Type
- Date range filter for booking dates
- Pagination (25 rows per page)
- Click a row to expand/view booking details

Admin-only columns visible when user is admin:

- Admin Notes (truncated, expand on click)
- Last Modified By
- Last Modified At

**Acceptance tests:**

1. Given 30 bookings exist, when the table view is displayed,
   then the first page shows 25 rows with correct column data,
   and pagination shows "Page 1 of 2".

2. Given bookings exist, when the "Status" column header is
   clicked, then rows are sorted by status alphabetically.
   Clicking again reverses the sort.

3. Given bookings exist, when "H100" is typed in the search
   box, then only bookings with GPU type H100 or containing
   "H100" in any text field are shown.

4. Given bookings exist, when the Status dropdown filter is
   set to "confirmed", then only confirmed bookings are shown.

5. Given bookings exist, when the GPU Type dropdown is set
   to "A100", then only A100 bookings are displayed.

6. Given bookings exist, when a date range filter is set to
   2026-03-01 to 2026-03-15, then only bookings overlapping
   that range are shown.

7. Given an admin user is viewing the table, then Admin Notes,
   Last Modified By, and Last Modified At columns are visible.

8. Given a non-admin user, then admin-only columns are not
   visible.

9. Given a booking row is clicked, then an expanded detail
   view shows all fields including optional ones (project PI,
   grant number, technical lead, event dates, alternate
   email).

### G2: User booking cancellation UI

As a user, I want to cancel my own bookings from the table
view, so that I can release resources I no longer need.

**Frontend file:** `frontend/components/booking-table.tsx`
**Server Action:** `frontend/app/actions.ts`

Each booking row owned by the current user shows a "Cancel"
button (unless already cancelled or rejected). Clicking it
shows a confirmation dialog. On confirmation, calls the
DELETE /api/v1/bookings/{id} endpoint via Server Action.

Server Action:

```typescript
export async function cancelBooking(
  bookingId: number,
): Promise<{ success: boolean; message: string }>
```

**Acceptance tests:**

1. Given user "a@b.com" has an unconfirmed booking, when they
   click "Cancel" and confirm, then the booking is removed
   from the table (deleted, since never admin-edited).

2. Given user "a@b.com" has a confirmed booking
   (admin-edited), when they click "Cancel" and confirm, then
   the booking status changes to "cancelled" and remains in
   the table.

3. Given user "a@b.com" views another user's booking, then no
   "Cancel" button is shown.

4. Given user "a@b.com" has a booking with status "cancelled",
   then no "Cancel" button is shown.

5. Given user "a@b.com" has a booking with status "rejected",
   then no "Cancel" button is shown.

---

## Section H: Admin Booking Management

### H1: Admin booking update endpoint

As an admin, I want to update any booking's status, notes, and
fields via the API, so that I can manage booking requests.

**Backend file:** `backend/api/v1/admin.py`
**Backend test:** `backend/tests/test_admin_api.py`

```python
@router.patch("/admin/bookings/{booking_id}",
              response_model=BookingResponse)
async def admin_update_booking(
    booking_id: int,
    update: AdminBookingUpdate,
    user: Annotated[UserInfo, Depends(require_admin)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> BookingResponse:
    """Admin update a booking.

    Can update: status, admin_notes, and all booking fields.
    Cannot delete bookings.
    Sets admin_modified_by to current admin email and
    admin_modified_at to current UTC time on every update.

    When changing status to confirmed/tentative/spot,
    validates that 100% capacity is not exceeded (blocks if
    so). Changing to rejected/cancelled always allowed.

    Re-runs capacity validation and includes warnings in
    response.
    """
```

**Acceptance tests:**

1. Given admin auth and a booking with status "unconfirmed",
   when PATCH /api/v1/admin/bookings/{id} with
   `{"status": "confirmed"}` is called, then response status
   is 200 and booking status is "confirmed",
   admin_modified_by is the admin's email, and
   admin_modified_at is set.

2. Given admin auth, when PATCH with
   `{"admin_notes": "Approved per PI agreement"}` is called,
   then admin_notes is updated and admin_modified_by/at are
   set.

3. Given admin auth, when PATCH with
   `{"status": "rejected"}` is called, then status is
   "rejected" regardless of capacity.

4. Given admin auth, when PATCH with
   `{"status": "confirmed"}` would exceed 100% capacity for
   that GPU type on any day, then response status is 409.

5. Given admin auth, when PATCH with
   `{"gpu_count": 10, "start_date": "2026-04-01"}` is called,
   then those booking fields are updated.

6. Given non-admin auth, when PATCH is called, then response
   status is 403.

7. Given a booking id that does not exist, when PATCH is
   called, then response status is 404.

8. Given admin auth and a booking with status "cancelled",
   when PATCH with `{"status": "confirmed"}` is called, then
   it succeeds (admin can reactivate cancelled bookings).

### H2: Admin booking management UI

As an admin, I want a web interface to review and manage all
bookings, so that I can confirm, reject, or modify booking
requests.

**Frontend file:** `frontend/app/admin/bookings/page.tsx`
**Frontend file:** `frontend/components/admin-booking-panel.tsx`
**Server Action:** `frontend/app/actions.ts`

The admin bookings page shows the full booking table (reusing
the booking-table component) with additional admin features:

- A side panel opens when clicking a booking row, showing all
  booking details and an edit form
- Status dropdown to change status (Unconfirmed, Confirmed,
  Tentative, Spot Booking, Rejected, Cancelled)
- Admin Notes textarea (only visible to admins)
- All booking fields are editable by admin
- A "Save" button submits changes via PATCH endpoint
- Capacity warnings are shown when changing status to
  confirmed/tentative/spot
- Last Modified By and Last Modified At shown at bottom of
  panel

Server Actions:

```typescript
export async function adminUpdateBooking(
  prev: AdminBookingFormState,
  formData: FormData,
): Promise<AdminBookingFormState>
```

**Acceptance tests:**

1. Given admin auth and bookings exist, when admin visits
   /admin/bookings, then the full booking table is displayed
   with admin columns visible.

2. Given admin clicks a booking row, then a side panel opens
   showing all booking fields in an editable form with a
   status dropdown and admin notes textarea.

3. Given admin changes status to "confirmed" and clicks
   "Save", then the booking is updated and a success toast is
   shown.

4. Given admin changes status to "confirmed" but it would
   exceed 100% capacity, then an error message is shown and
   the update is rejected.

5. Given admin edits admin_notes to "Approved - project
   priority" and saves, then the notes are saved and
   admin_modified_by shows the admin's email.

6. Given admin changes gpu_count from 10 to 15 and saves,
   then the booking is updated with the new gpu_count.

### H3: Admin dashboard

As an admin, I want a dashboard page with links to all admin
functions, so that I can navigate the admin interface easily.

**Frontend file:** `frontend/app/admin/page.tsx`

The admin dashboard page shows:

- A heading "Admin Dashboard"
- Cards/links to: Manage Bookings (/admin/bookings),
  GPU Types (/admin/gpu-types),
  Workflow Types (/admin/workflow-types),
  Memory Options (/admin/memory-options)
- Summary stats: total pending bookings, total confirmed
  bookings this month, total GPU types configured

Only accessible to admin users. Non-admin users see an
"Access Denied" message.

**Acceptance tests:**

1. Given admin auth, when visiting /admin, then the dashboard
   is displayed with cards linking to all admin pages.

2. Given admin auth and 5 pending bookings, then the dashboard
   shows "5 pending bookings".

3. Given non-admin auth, when visiting /admin, then an
   "Access Denied" message is displayed.

---

## Section I: Monitoring and Observability

### I1: Structured JSON logging

As a developer, I want structured JSON logging on the backend,
so that logs are machine-parsable for ELK and other log
aggregation systems.

**Backend file:** `backend/logging_config.py`
**Backend test:** `backend/tests/test_logging.py`

Configure Python's logging to output structured JSON format.
Each log entry must include: timestamp, level, message,
logger name. Request-scoped log entries additionally include:
request_id (UUID generated per request), user_email, path,
method, status_code.

Use a middleware to add request context. Log level configurable
via LOG_LEVEL env var (default: INFO).

Add to config.py:
log_level: str = "INFO"

**Acceptance tests:**

1. Given LOG_LEVEL=INFO, when a request to
   GET /api/v1/health is made, then at least one log line is
   emitted that is valid JSON containing keys "timestamp",
   "level", "message".

2. Given LOG_LEVEL=INFO, when a request to
   GET /api/v1/bookings is made by "user@example.com", then
   the log entry contains "user_email": "user@example.com",
   "path": "/api/v1/bookings", "method": "GET".

3. Given LOG_LEVEL=WARNING, when an INFO-level event occurs,
   then it is NOT emitted in the log output.

4. Given LOG_LEVEL=DEBUG, when a DEBUG-level event occurs,
   then it IS emitted in the log output.

5. Given two concurrent requests, when logs are emitted, then
   each log entry contains a unique "request_id" that differs
   between the two requests.

### I2: Health check with database connectivity

As a developer, I want the health check endpoint to verify
database connectivity, so that external monitors (Nagios) can
detect when the system is degraded.

**Backend file:** `backend/api/v1/health.py`
**Backend test:** `backend/tests/test_health.py`
**Frontend file:** `frontend/lib/contracts.ts`
**Frontend test:** `frontend/tests/contracts.test.ts`

Extend the existing health endpoint to check database
connectivity. Return a structured response.

Response model:
```python
class HealthResponse(BaseModel):
    status: str  # "healthy" or "unhealthy"
    database: str  # "ok" or "error: <message>"
```

The endpoint should:
- Execute a simple query (SELECT 1) to verify DB connectivity
- Return 200 with status="healthy" when all checks pass
- Return 503 with status="unhealthy" when DB check fails
- Always return valid JSON for machine parsing

Zod schema (update existing healthResponseSchema):
```typescript
export const healthResponseSchema = z.object({
  status: z.enum(["healthy", "unhealthy"]).or(z.string()),
  database: z.string(),
});
```

**Acceptance tests:**

1. Given a healthy database, when GET /api/v1/health is called,
   then response status is 200 and body is
   {"status": "healthy", "database": "ok"}.

2. Given the database is unreachable (engine configured with
   invalid URL), when GET /api/v1/health is called, then
   response status is 503 and body contains
   {"status": "unhealthy", "database": "error: ..."}.

3. Given the healthResponseSchema Zod schema and payload
   {"status": "healthy", "database": "ok"}, when .parse() is
   called, then it succeeds.

4. Given the healthResponseSchema Zod schema and payload
   {"status": "healthy"} (missing database field), when
   .safeParse() is called, then result.success is false.

## Implementation Order

### Phase 1: Database Foundation

Stories: A1, A2, A3, I2

Set up the async database engine, ORM models, and seeding.
All three are sequential: engine first, models depend on
engine, seeding depends on models. I2 (health check with
database connectivity) extends the existing health endpoint
and needs the DB engine from A1.

A1 and A2 can be partially parallelized (engine setup and
model definitions are somewhat independent), but A3 (seeding)
must come after both. I2 can be done after A1.

### Phase 2: Authentication

Stories: B1, I1, B2, B3, B4

Sequential: config first (B1), then structured logging (I1,
which needs config for LOG_LEVEL), then middleware (B2), then
auth endpoint (B3), then frontend auth provider (B4). I1 can
be done in parallel with B2 since it only depends on B1.

### Phase 3: Reference Data APIs and Contracts

Stories: C1, C2, C3, C4, D4

Backend endpoints for GPU types, workflow types, GRAM
options, and memory options. D4 (booking Zod contracts) is
included here as it defines frontend types needed by later
phases. C1-C4 are independent of each other and can be
implemented in parallel. D4 can also be done in parallel.

### Phase 4: Booking CRUD Backend

Stories: D1, D2, D3, E1

D1 (booking creation) depends on Phase 3 for reference data
validation. E1 (capacity service) is needed by D1 for
validation. Implement E1 first, then D1, then D2 and D3
(which are independent of each other).

### Phase 5: Capacity Endpoints

Stories: E2, E3

Both depend on E1 from Phase 4. E2 and E3 are independent
and can be implemented in parallel.

### Phase 6: Admin Booking Backend

Stories: H1

Admin booking update endpoint. Depends on Phase 4 for
booking CRUD and Phase 2 for admin auth.

### Phase 7: Admin Configuration UI

Stories: C5, C6, C7, H3

All admin config UIs and dashboard. C5, C6, C7 are
independent and can be implemented in parallel. H3 (admin
dashboard) depends on having the admin routes set up but
can be done in parallel with C5-C7.

### Phase 8: Calendar and Booking Form

Stories: F1, F2, F3

Sequential: F1 (calendar page and grid) first, then F2
(calendar interaction) and F3 (booking form). F2 depends
on F1. F3 can be partially parallel with F2 since the form
component is somewhat independent.

### Phase 9: Table View and User Actions

Stories: G1, G2

G1 (table component) first, then G2 (cancellation UI) which
adds cancel functionality to the table.

### Phase 10: Admin Booking UI

Stories: H2

Admin booking management UI. Depends on H1 (admin update
endpoint from Phase 6) and the table component from Phase 9.

---

## Appendix: Key Decisions

### Skills

This spec is designed to be implemented using the `implementor`
skill (`.github/skills/implementor/SKILL.md`) following a strict
TDD cycle. Each acceptance test should be written as a failing
test first, then implemented to pass. Code review is performed
by the `code-reviewer` skill
(`.github/skills/code-reviewer/SKILL.md`).

Phase files reference these skills rather than duplicating
their instructions.

### Existing Code Reuse

The following existing infrastructure should be reused:

- `backend/config.py` - Extend with new settings via
  Pydantic Settings (database_url, auth_mode, Okta config,
  initial_admin_emails).
- `backend/main.py` - Add database lifespan, include new
  routers, add auth middleware.
- `backend/api/schemas.py` - Add all new Pydantic models here.
- `frontend/lib/backend-client.ts` - Use `backendJson()` for
  all Server Action to FastAPI communication.
- `frontend/lib/contracts.ts` - Keep existing schemas, add
  new booking/admin schemas in separate files.
- `frontend/app/actions.ts` - Extend with new Server Actions.
- `frontend/components/ui/` - Use existing shadcn/ui
  components (button, card, input, toast, tooltip). Add new
  ones as needed (select, dialog, table, calendar,
  dropdown-menu, tabs, badge, separator, sheet).

### Database Design

- Start with SQLite via `aiosqlite` for simplicity.
- Use SQLAlchemy async ORM with `AsyncSession`.
- Abstract the engine creation so swapping to MySQL requires
  only changing `database_url` in config (e.g.
  `mysql+aiomysql://...`).
- Do NOT use Alembic migrations for the initial version.
  Tables are created via `metadata.create_all()` on startup.
  Migration tooling can be added later.

### Authentication

- OIDC flow is handled server-side. The backend validates
  tokens and manages sessions.
- In insecure mode, user identity comes from the `X-Dev-User`
  header, defaulting to admin. This enables testing without
  Okta setup.
- Admin status is determined by checking the user's email
  against the `admins` table.
- The frontend auth provider fetches `/api/v1/auth/me` on
  mount and provides user context to all components.

### Capacity Rules

- **40% per-user cap:** The user's total GPU usage across ALL
  GPU types on any given day must not exceed 40% of the grand
  total of all GPUs. This is a soft warning only.
- **100% hard block:** For the specific GPU type being booked,
  if confirmed + tentative + spot bookings would exceed the
  type's total_count on any day, the booking is blocked.
- Unconfirmed bookings are shown in the calendar but do NOT
  count toward the 100% hard cap. They show as pending.
- Spot bookings are treated as confirmed for both the 40%
  warning and the 100% block calculations.

### Booking Lifecycle

1. User creates booking - status = unconfirmed
2. Admin reviews:
   - Confirms - confirmed
   - Sets tentative - tentative
   - Sets spot - spot (confirmed but moveable)
   - Rejects - rejected
3. User cancels:
   - If never admin-edited (admin_modified_at is null) -
     permanently deleted
   - If admin-edited - status = cancelled
4. Admin cancels - status = cancelled
5. Admin can reactivate a cancelled/rejected booking by
   changing status back to confirmed/tentative/spot

### Time Zone and Dates

- All booking dates are in UK local time (Europe/London).
- Bookings are for whole days only.
- A booking from start_date to end_date covers all days
  inclusive [start_date, end_date].
- Reservations are understood to end at midnight after the
  end_date.
- Date storage in the database is as date type (no time
  component).

### Error Handling

- **Backend validation errors:** Return HTTP 400 with
  `{"detail": "specific message"}`.
- **Pydantic validation failures:** Return HTTP 422
  automatically via FastAPI.
- **Auth failures:** HTTP 401 (not authenticated) or
  HTTP 403 (not authorized).
- **Not found:** HTTP 404.
- **Capacity blocks:** HTTP 409 with detail explaining
  which days and GPU types are over capacity.
- **Referential integrity:** HTTP 409 when trying to delete
  a config item (GPU type, workflow type, etc.) that is
  referenced by existing bookings.
- **Frontend errors:** Server Actions return typed error
  states. Components show toast notifications for errors.
  The global error boundary catches unexpected errors.

### Testing Strategy

- **Backend unit tests:** pytest with in-memory SQLite
  (`sqlite+aiosqlite://`). Each test gets a fresh database.
  Use `httpx.AsyncClient` with `ASGITransport` for endpoint
  tests.
- **Frontend contract tests:** Vitest tests in
  `frontend/tests/` validating Zod schemas with `.parse()`
  and `.safeParse()` against valid and invalid payloads.
- **Integration:** Verified through the full Server Action
  flow (Server Action - backendJson - FastAPI endpoint).
- **No end-to-end browser tests** in this version. UI
  behaviour is specified for manual verification and future
  Playwright tests.

### Future Considerations (Out of Scope)

- Email notifications for booking status changes
- Import of existing Google Sheet bookings
- Cluster and queue selection
- Dockerfiles and Helm charts
- External REST API documentation (OpenAPI is auto-generated)
- Alembic migrations
- Auto-calculation of GRAM/system memory from GPU count
  (designed for but not implemented)
