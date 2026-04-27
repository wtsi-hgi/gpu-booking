# Phase 5: Capacity Endpoints

Ref: [spec.md](spec.md) sections E2, E3

## Instructions

Use the `orchestrator` skill to complete this phase, coordinating
subagents with the `implementor` and `code-reviewer` skills.

## Items

### Batch 1 (parallel)

#### Item 5.1: E2 - Capacity endpoint [parallel with 5.2]

spec.md section: E2

Implement GET /api/v1/capacity with required start_date and
end_date query params and optional gpu_type_id filter.
Returns list of DailyCapacity via the capacity service from
E1. Define dailyCapacitySchema and dailyCapacityListSchema
Zod schemas in booking-contracts.ts. See spec.md for full
details and 5 acceptance tests.

- [x] implemented
- [x] reviewed

#### Item 5.2: E3 - Booking validation endpoint [parallel with 5.1]

spec.md section: E3

Implement POST /api/v1/capacity/validate accepting a
BookingCreate body and returning BookingValidation via the
capacity service from E1. Define capacityWarningSchema and
bookingValidationSchema Zod schemas in booking-contracts.ts.
See spec.md for full details and 4 acceptance tests.

- [x] implemented
- [x] reviewed

For parallel batch items, use separate subagents per item.
Launch review subagents using the `code-reviewer` skill (review
all items in the batch together in a single review pass).
