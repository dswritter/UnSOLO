import Link from 'next/link'
import { getRequestAuth, getRequestProfile } from '@/lib/auth/request-session'
import { WanderMobileAccountMenu } from '@/components/wander/WanderMobileAccountMenu'
import { ColorModeToggle } from '@/components/layout/ColorModeToggle'

export async function WanderMobileAccountSlotServer() {
  const { user } = await getRequestAuth()
  if (!user) return <>
    <ColorModeToggle className="h-8 w-8" />
    <Link href="/login?redirectTo=%2F" className="rounded-full border border-border bg-card/70 px-3 py-1.5 text-[11px] font-semibold text-foreground backdrop-blur-md">Sign in</Link>
  </>

  const profile = await getRequestProfile(user.id)
  if (!profile) return null
  return <WanderMobileAccountMenu profile={{
    id: user.id,
    username: profile.username,
    full_name: profile.full_name ?? null,
    avatar_url: profile.avatar_url ?? null,
    role: profile.role ?? null,
  }} />
}
