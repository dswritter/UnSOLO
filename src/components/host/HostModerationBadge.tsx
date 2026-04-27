import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { hostModerationBadgeClass } from './hostBadgeStyles'

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
}: {
  status: string
  className?: string
  size?: 'md' | 'sm'
}) {
  const s = String(status).toLowerCase()
  const label = DEFAULT_LABELS[s] ?? status
  return (
    <Badge
      className={cn(
        'border font-medium',
        size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs',
        hostModerationBadgeClass(status),
        className,
      )}
    >
      {label}
    </Badge>
  )
}
