# Booking Request Form

## What It Is

A host booking request with dates, inclusive duration, project information,
capacity feedback and warning confirmation.

## How To Reach It

Double-click a calendar day or select a range and choose Create Booking.
The direct route `/bookings/new?start=2028-02-28&end=2028-02-29` supplies fixed
dates for the duration regression.

## How To Drive It

Follow the skill's default command. The duration test changes dates and Number
of Days across leap day, year end and DST. Invalid counts must not submit a
stale date range. The test submits through Create Booking, opens the saved
booking in admin management and checks the persisted end date.

Run `e2e/bookings.spec.ts` for calendar entry, required controls, warning
confirmation, and successful creation. Run
`e2e/admin-past-booking-repro.spec.ts` for an administrator's past booking.
Inspect `.tmp/agent/booking-days-after.png`.

The same spec also runs configured cost code suggestions through the backend's
JSON file and both create/admin forms. The synthetic fixture is
`frontend/e2e/fixtures/booking-options.json`, passed to the backend with
`GPU_BOOKING_BOOKING_OPTIONS_FILE`. Configured suggestions must appear while
other manually entered codes remain valid and persist after save/reload.
Inspect `.tmp/agent/cost-codes-after.png`.

PI suggestions use the same file's `project_pis` list. The spec checks
PI/Lead on creation and Project PI in admin editing, including configured
names, external Unicode names and empty values. Each value must persist after
save/reload. Inspect
`.tmp/agent/project-pis-after.png`.

## Gotchas

Duration includes both endpoints; a same-day booking is one day. Event dates
default from the initial booking dates and remain independently editable.
Normal users cannot book past dates. The duration test uses seeded admin
identity and America/New_York to cover UTC arithmetic across DST.
