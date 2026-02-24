# Phase 10: Admin Booking UI

Ref: [spec.md](spec.md) sections H2

## Instructions

Use the `orchestrator` skill to complete this phase, coordinating
subagents with the `implementor` and `code-reviewer` skills.

## Items

### Item 10.1: H2 - Admin booking management UI

spec.md section: H2

Build the admin bookings page at
frontend/app/admin/bookings/page.tsx and the
admin-booking-panel component. Reuses the booking-table
component with additional admin features: a side panel
with an edit form for all booking fields, status dropdown,
admin notes textarea, capacity warnings on status changes,
and a Save button calling PATCH via an adminUpdateBooking
Server Action. Shows Last Modified By/At at the bottom of
the panel. See spec.md for 6 acceptance tests.

- [ ] implemented
- [ ] reviewed
