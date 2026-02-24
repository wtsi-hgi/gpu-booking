# Phase 1: Database Foundation

Ref: [spec.md](spec.md) sections A1, A2, A3, I2

## Instructions

Use the `orchestrator` skill to complete this phase, coordinating
subagents with the `implementor` and `code-reviewer` skills.

## Items

### Batch 1 (parallel)

#### Item 1.1: A1 - Database engine and session management [parallel with 1.2]

spec.md section: A1

Implement the async SQLAlchemy engine with aiosqlite, the
`init_db()` function to create all tables, and the
`get_session()` FastAPI dependency. Add `database_url` setting
to config.py. See spec.md for full details and 3 acceptance
tests.

- [ ] implemented
- [ ] reviewed

#### Item 1.2: A2 - ORM models [parallel with 1.1]

spec.md section: A2

Define SQLAlchemy ORM models for Admin, GpuType, WorkflowType,
GramOption, MemoryOption, and Booking with all fields, foreign
keys, defaults, and unique constraints. Define the
BookingStatus enum. See spec.md for full details and 6
acceptance tests.

- [ ] implemented
- [ ] reviewed

### Batch 2 (parallel)

#### Item 1.3: A3 - Database seeding [parallel with 1.4]

spec.md section: A3

Implement `seed_db()` to populate GPU types, workflow types,
GRAM options, memory options, and admin emails from the
`INITIAL_ADMIN_EMAILS` env var. Must be idempotent (only seeds
empty tables). See spec.md for full details and 6 acceptance
tests.

- [ ] implemented
- [ ] reviewed

#### Item 1.4: I2 - Health check with database connectivity [parallel with 1.3]

spec.md section: I2

Extend the existing health endpoint to verify database
connectivity via SELECT 1. Return structured HealthResponse
with status and database fields. Return 503 when DB is
unreachable. Update the frontend Zod healthResponseSchema.
See spec.md for full details and 4 acceptance tests.

- [ ] implemented
- [ ] reviewed

For parallel batch items, use separate subagents per item.
Launch review subagents using the `code-reviewer` skill (review
all items in the batch together in a single review pass).
