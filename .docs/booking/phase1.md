# Phase 1: Persistence and reference data foundation

Ref: [spec.md](spec.md) sections B1, B2, G1

## Instructions

Use the `orchestrator` skill to complete this phase, coordinating
subagents with the `implementor` and `code-reviewer` skills.

## Items

### Batch 1 (parallel)

#### Item 1.1: B1 - Seeded and admin-configurable reference data [parallel with 1.2]

spec.md section: B1

Implement DB bootstrap defaults for GPU/workflow/memory reference entities and
admin-only CRUD update paths, covering all 4 acceptance tests from spec.md
section B1.

- [ ] implemented
- [ ] reviewed

#### Item 1.2: B2 - Admin allowlist env seeding [parallel with 1.1]

spec.md section: B2

Implement `INITIAL_ADMIN_EMAILS` parsing, normalization, idempotent insertion,
and warning behavior for empty values, covering all 4 acceptance tests from
spec.md section B2.

- [ ] implemented
- [ ] reviewed

### Item 1.3: G1 - K8s-friendly env configuration and DB swappability

spec.md section: G1

Implement environment-driven startup validation and DB engine abstraction for
SQLite/MySQL DSN switching, depending on B1/B2 persistence foundations,
covering all 4 acceptance tests from spec.md section G1.

- [ ] implemented
- [ ] reviewed

For parallel batch items, use separate subagents per item.
Launch review subagents using the `code-reviewer` skill (review
all items in the batch together in a single review pass).
