import { cn } from '@/lib/utils'

type CapacityBarProps = {
  total: number
  confirmedUsed: number
  pendingUsed: number
  className?: string
}

function clampPercent(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(100, value))
}

export function CapacityBar({
  total,
  confirmedUsed,
  pendingUsed,
  className,
}: CapacityBarProps) {
  const safeTotal = Math.max(total, 0)
  const confirmedPercent =
    safeTotal > 0 ? clampPercent((confirmedUsed / safeTotal) * 100) : 0
  const pendingPercent =
    safeTotal > 0 ? clampPercent((pendingUsed / safeTotal) * 100) : 0
  const usedPercent = clampPercent(confirmedPercent + pendingPercent)

  return (
    <div
      className={cn(
        'border-border bg-muted relative h-3 w-full overflow-hidden rounded border',
        className
      )}
      role="img"
      aria-label={`${usedPercent}% capacity used`}
      data-capacity-total={safeTotal}
      data-capacity-confirmed-percent={confirmedPercent}
      data-capacity-pending-percent={pendingPercent}
      data-capacity-used-percent={usedPercent}
    >
      <div
        className="absolute inset-y-0 left-0 bg-primary"
        style={{ width: `${confirmedPercent}%` }}
        data-capacity-segment="confirmed"
      />
      <div
        className="absolute inset-y-0 bg-accent bg-[repeating-linear-gradient(-45deg,transparent,transparent_3px,color-mix(in_oklab,var(--color-foreground)_22%,transparent)_3px,color-mix(in_oklab,var(--color-foreground)_22%,transparent)_6px)]"
        style={{ left: `${confirmedPercent}%`, width: `${pendingPercent}%` }}
        data-capacity-segment="pending"
      />
    </div>
  )
}
