import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { hostModerationBadgeClass, hostModerationBadgeClassForest } from './hostBadgeStyles'

const DEFAULT_LABELS: Record<string, string> = {
  approved: 'Approved',
  pending: 'Pending Review',
  rejected: 'Rejected',
  declined: 'Declined',
}

export function HostModerationBadge({
  status,
  className,
  size = 'md',
  forestContrast = false,
}: {
  status: string
  className?: string
  size?: 'md' | 'sm'
  /** Stronger pills for `.wander-theme` host dashboard cards */
  forestContrast?: boolean
}) {
  const s = String(status).toLowerCase()
  const label = DEFAULT_LABELS[s] ?? status
  return (
    <Badge
      className={cn(
        'border font-medium',
        size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs',
        forestContrast ? hostModerationBadgeClassForest(status) : hostModerationBadgeClass(status),
        className,
      )}
    >
      {label}
    </Badge>
  )
}
