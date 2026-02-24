# Phase 6: Admin Booking Backend

Ref: [spec.md](spec.md) sections H1

## Instructions

Use the `orchestrator` skill to complete this phase, coordinating
subagents with the `implementor` and `code-reviewer` skills.

## Items

### Item 6.1: H1 - Admin booking update endpoint

spec.md section: H1

Implement the PATCH /api/v1/admin/bookings/{booking_id}
endpoint in backend/api/v1/admin.py. The endpoint allows
admins to update any booking's status, admin_notes, and all
booking fields. It sets admin_modified_by and
admin_modified_at on every update, validates capacity when
changing status to confirmed/tentative/spot (returns 409 if
exceeded), and always allows rejected/cancelled status
changes. Non-admin requests return 403; missing bookings
return 404. See spec.md for the full AdminBookingUpdate
schema and 8 acceptance tests.

- [ ] implemented
- [ ] reviewed
