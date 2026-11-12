import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

export function formatUtcDate(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, '0')} ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

export function formatUtcDateTime(value: string | null): string {
  if (!value) {
    return '—'
  }

  // Backend UTC timestamps omit the zone; explicit zones already define an instant.
  const naiveIsoDateTime =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/
  const date = new Date(naiveIsoDateTime.test(value) ? `${value}Z` : value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return `${formatUtcDate(date)}, ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}
