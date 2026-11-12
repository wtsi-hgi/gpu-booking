# Calendar And Selection

## What It Is

Monthly host availability, booking inspection, date selection and a table view.

## How To Reach It

Open `/bookings`. Calendar is the default tab; Table shows booking rows.

## How To Drive It

Follow the skill's Doctor, then run `e2e/booking-inputs.spec.ts` for Monday
headings, aligned dates and continuous dates when dragging beyond the grid.
Run `e2e/bookings.spec.ts` for host filtering, table details, cancellation,
double-click and drag entry to the create form, and availability-dependent CTAs.
Run `e2e/calendar-styling.spec.ts` for light/dark selection and today indicators.

The date selection panel must show the chosen inclusive range; create entry
must carry those dates. Inspect the captured calendar screenshot.

## Gotchas

The calendar uses UTC dates. Existing booking tests derive dates from the
current month. Styling tests exercise rendered pixels in both themes.
