# Phase 3: Reference Data APIs and Contracts

Ref: [spec.md](spec.md) sections C1, C2, C3, C4, D4

## Instructions

Use the `orchestrator` skill to complete this phase, coordinating
subagents with the `implementor` and `code-reviewer` skills.

## Items

### Batch 1 (parallel)

#### Item 3.1: C1 - GPU type management endpoints [parallel with 3.2, 3.3, 3.4, 3.5]

spec.md section: C1

Implement GET /api/v1/gpu-types (public), POST and PUT
/api/v1/admin/gpu-types (admin-only). Define gpuTypeSchema and
gpuTypeListSchema Zod schemas in admin-contracts.ts. See
spec.md for full details and 7 acceptance tests.

- [x] implemented
- [x] reviewed

#### Item 3.2: C2 - Workflow type management endpoints [parallel with 3.1, 3.3, 3.4, 3.5]

spec.md section: C2

Implement GET /api/v1/workflow-types (public), POST, PUT, and
DELETE /api/v1/admin/workflow-types (admin-only). Delete fails
if referenced by a booking. Define workflowTypeSchema Zod
schema. See spec.md for full details and 6 acceptance tests.

- [x] implemented
- [x] reviewed

#### Item 3.3: C3 - GRAM option management endpoints [parallel with 3.1, 3.2, 3.4, 3.5]

spec.md section: C3

Implement GET /api/v1/gram-options (public, ordered by
sort_order), POST, PUT, and DELETE /api/v1/admin/gram-options
(admin-only). Delete fails if referenced by a booking. Define
gramOptionSchema Zod schema. See spec.md for full details and
5 acceptance tests.

- [x] implemented
- [x] reviewed

#### Item 3.4: C4 - System memory option management endpoints [parallel with 3.1, 3.2, 3.3, 3.5]

spec.md section: C4

Implement GET /api/v1/memory-options (public, ordered by
sort_order), POST, PUT, and DELETE
/api/v1/admin/memory-options (admin-only). Delete fails if
referenced by a booking. Define memoryOptionSchema Zod schema.
See spec.md for full details and 4 acceptance tests.

- [x] implemented
- [x] reviewed

#### Item 3.5: D4 - Booking Zod contracts [parallel with 3.1, 3.2, 3.3, 3.4]

spec.md section: D4

Define bookingStatusSchema, bookingResponseSchema, and
bookingListSchema Zod schemas in booking-contracts.ts matching
the backend BookingResponse Pydantic model. See spec.md for
full details and 6 acceptance tests.

- [x] implemented
- [x] reviewed

For parallel batch items, use separate subagents per item.
Launch review subagents using the `code-reviewer` skill (review
all items in the batch together in a single review pass).
