# Phase 8: Calendar and Booking Form

Ref: [spec.md](spec.md) sections F1, F2, F3

## Instructions

Use the `orchestrator` skill to complete this phase, coordinating
subagents with the `implementor` and `code-reviewer` skills.

## Items

### Item 8.1: F1 - Calendar page and monthly grid

spec.md section: F1

Build the bookings page at frontend/app/bookings/page.tsx
with Calendar and Table tabs. Implement the calendar-view
and capacity-bar components. The calendar shows a monthly
grid with capacity bars per day (solid green for confirmed,
hatched for pending), GPU type filter dropdown, and
month navigation. Add getCapacity and getBookings Server
Actions. See spec.md for 6 acceptance tests.

- [x] implemented
- [x] reviewed

### Batch 2 (parallel)

#### Item 8.2: F2 - Calendar booking creation interaction [parallel with 8.3]

spec.md section: F2

Add interactive booking creation to the calendar view.
Double-clicking a day opens the booking form with that
date as start and end. Click-and-drag across days sets the
date range. A "New Booking" button opens the form without
pre-filled dates. The form page at
frontend/app/bookings/new/page.tsx accepts optional start
and end query params. See spec.md for 4 acceptance tests.

- [x] implemented
- [x] reviewed

#### Item 8.3: F3 - Booking creation form [parallel with 8.2]

spec.md section: F3

Build the booking-form component and booking-state module.
The form includes required fields (GPU Type, GPU Count,
GRAM, System Memory, Workflow Type, Start/End Date) and
optional fields (Alternate Email, Project Name, PI/Lead,
Grant Number, Technical Lead, Event Dates). A "Validate"
button calls the validation endpoint showing
warnings/blocks. Uses useActionState with a createBooking
Server Action. See spec.md for 7 acceptance tests.

- [x] implemented
- [x] reviewed

For parallel batch items, use separate subagents per item.
Launch review subagents using the `code-reviewer` skill (review
all items in the batch together in a single review pass).
