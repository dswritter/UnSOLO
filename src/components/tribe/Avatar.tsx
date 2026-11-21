import type { UserLite } from '@/lib/tribe/models'
import { cn } from '@/lib/utils'
import { initials } from './format'

export function Avatar({ user, size = 36, className }: { user: UserLite; size?: number; className?: string }) {
  return (
    <span className={cn('fc-av', className)} style={{ width: size, height: size, fontSize: Math.max(10, size * 0.34) }} aria-hidden>
      {user.avatarUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={user.avatarUrl} alt="" loading="lazy" decoding="async" />
        : initials(user.name)}
    </span>
  )
}
