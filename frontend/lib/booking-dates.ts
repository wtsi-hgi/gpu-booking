const dayMilliseconds = 86_400_000

function parseDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') {
    return null
  }

  const timestamp = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp
    : null
}

export function getBookingDays(startDate: string, endDate: string): string {
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  if (start === null || end === null || end < start) {
    return ''
  }
  return String((end - start) / dayMilliseconds + 1)
}

export function getBookingEndDate(startDate: string, days: string): string {
  const start = parseDate(startDate)
  const count = Number(days)
  const maxDays = Number(getBookingDays(startDate, '9999-12-31'))
  if (
    start === null ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > maxDays
  ) {
    return ''
  }
  return new Date(start + (count - 1) * dayMilliseconds)
    .toISOString()
    .slice(0, 10)
}
