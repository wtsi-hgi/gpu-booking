# Phase 4: Booking CRUD Backend

Ref: [spec.md](spec.md) sections E1, D1, D2, D3

## Instructions

Use the `orchestrator` skill to complete this phase, coordinating
subagents with the `implementor` and `code-reviewer` skills.

## Items

### Item 4.1: E1 - Capacity calculation service

spec.md section: E1

Implement `get_daily_capacity()` to calculate per-day, per-GPU-
type capacity (total, confirmed_used, pending_used, available,
user_used, user_percent). Implement `validate_booking()` with
the 40% per-user warning rule, 100% hard block, duration >14
days warning, and <14 days advance notice warning. See spec.md
for full details and 13 acceptance tests.

- [ ] implemented
- [ ] reviewed

### Item 4.2: D1 - Booking creation endpoint with validation

spec.md section: D1

Implement POST /api/v1/bookings with date validation, reference
data validation, capacity validation (via E1), and warning
generation. Return 409 on hard capacity block. Include warnings
in the BookingResponse. See spec.md for full details and 11
acceptance tests.

- [ ] implemented
- [ ] reviewed

### Batch 3 (parallel)

#### Item 4.3: D2 - Booking list endpoint [parallel with 4.4]

spec.md section: D2

Implement GET /api/v1/bookings with optional filters for
start_date, end_date, gpu_type_id, and status. Filter by date
range overlap. Hide admin_notes from non-admin users. See
spec.md for full details and 6 acceptance tests.

- [ ] implemented
- [ ] reviewed

#### Item 4.4: D3 - Booking cancellation endpoint [parallel with 4.3]

spec.md section: D3

Implement DELETE /api/v1/bookings/{id}. Owner can cancel own
booking: permanently deletes if never admin-edited, otherwise
sets status to cancelled. Admin can cancel any booking (sets
to cancelled). Non-owner non-admin gets 403. See spec.md for
full details and 6 acceptance tests.

- [ ] implemented
- [ ] reviewed

For parallel batch items, use separate subagents per item.
Launch review subagents using the `code-reviewer` skill (review
all items in the batch together in a single review pass).
