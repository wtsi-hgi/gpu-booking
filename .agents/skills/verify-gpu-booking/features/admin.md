# Admin Management

## What It Is

Booking editing and reference-data management for administrators.

## How To Reach It

Choose Admin Dashboard while signed in as seeded `admin@example.com`.
Manage Bookings opens `/admin/bookings`; GPU Host Types and Workflow Types
open their corresponding management pages.

## How To Drive It

Follow Doctor and run `e2e/admin.spec.ts` through the same Playwright command.
It drives dashboard navigation, booking edits, reservation validation,
capacity rejection and reference-data creation, update and deletion.

The default `e2e/booking-inputs.spec.ts` additionally opens a booking row,
changes its dates and Number of Days, saves and reloads. The drawer must show
the saved dates and recalculated duration after reload.

## Gotchas

Reference-data tests mutate only the isolated test database. Confirmed
bookings require a reservation name. Keep the harness's synthetic identities;
it does not need production authentication or directory access.
