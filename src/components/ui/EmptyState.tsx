import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface EmptyStateAction {
  label: string
  href: string
}

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: EmptyStateAction
  size?: 'sm' | 'md' | 'lg'
  dashed?: boolean
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = 'md',
  dashed = false,
  className = '',
}: EmptyStateProps) {
  const padding = size === 'lg' ? 'py-16' : size === 'sm' ? 'py-8' : 'py-12'
  const iconSize = size === 'lg' ? 'h-14 w-14' : size === 'sm' ? 'h-9 w-9' : 'h-11 w-11'
  const titleSize = size === 'lg' ? 'text-xl' : 'text-base'
  const border = dashed ? 'border border-dashed border-border bg-card/40 rounded-xl' : ''
  return (
    <div className={`text-center ${padding} ${border} ${className}`}>
      <Icon className={`${iconSize} text-primary/40 mx-auto mb-3`} />
      <h3 className={`${titleSize} font-bold mb-1`}>{title}</h3>
      {description ? (
        <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">{description}</p>
      ) : null}
      {action ? (
        <Button asChild size="sm" className="bg-primary text-primary-foreground font-bold">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : null}
    </div>
  )
}
