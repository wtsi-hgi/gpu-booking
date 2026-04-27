# Phase 9: Table View and User Actions

Ref: [spec.md](spec.md) sections G1, G2

## Instructions

Use the `orchestrator` skill to complete this phase, coordinating
subagents with the `implementor` and `code-reviewer` skills.

## Items

### Item 9.1: G1 - Booking table component

spec.md section: G1

Build the booking-table component for the Table tab on the
/bookings page. Columns: Status (color badge), User Email,
GPU Type, GPU Count, Start/End Date, Workflow Type, Project
Name, Created At. Features: column sorting, text search,
dropdown filters (Status, GPU Type), date range filter,
pagination (25 per page), row click to expand details.
Admin-only columns (Admin Notes, Last Modified By/At) are
visible when the user is an admin. See spec.md for 9
acceptance tests.

- [x] implemented
- [x] reviewed

### Item 9.2: G2 - User booking cancellation UI

spec.md section: G2

Add cancellation functionality to the booking table. Each
row owned by the current user shows a "Cancel" button
(unless already cancelled or rejected). Clicking shows a
confirmation dialog; on confirmation, calls DELETE
/api/v1/bookings/{id} via a cancelBooking Server Action.
Bookings never admin-edited are deleted; admin-edited
bookings change status to "cancelled". See spec.md for 5
acceptance tests.

- [x] implemented
- [x] reviewed
