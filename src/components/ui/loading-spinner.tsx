import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Shared loading glyph — use for inline states and simple route fallbacks. */
export function LoadingSpinner({
  className,
  size = 'md',
  label,
}: {
  className?: string
  size?: 'sm' | 'md' | 'lg'
  /** Sets aria-label on the status region */
  label?: string
}) {
  const sz = size === 'sm' ? 'h-5 w-5' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9'
  return (
    <Loader2
      className={cn(sz, 'animate-spin text-primary', className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'status' : undefined}
    />
  )
}
