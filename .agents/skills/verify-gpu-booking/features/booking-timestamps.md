# Booking Timestamps

## What It Is

Booking creation and admin modification timestamps display in UTC consistently
across server and browser timezones.

## How To Reach It

Open `/admin/bookings` as `admin@example.com` using insecure development auth.
Select a row to open the admin drawer.

## How To Drive It

Run the parent skill's Launch And Drive command. The regression creates a
booking through the API, updates admin notes through the API, and navigates a
New York browser to the real admin page at 1440x1000. It searches the fixture,
checks both table timestamps, opens the drawer, and checks modification time.
Expected UTC values derive from the API response with an explicit UTC zone.
The run must report no browser page errors, including hydration failures.

## Gotchas

Server `TZ=UTC` deliberately differs from the browser timezone. The backend
returns UTC datetimes without a timezone suffix. Fixture booking dates are in
June 2028, and the harness recreates its isolated database for each run.
Explicit Z/offset and null/invalid rendering cases also run in the named
`make test` gate through `tests/admin-bookings-page.test.ts`.
