import Link from 'next/link'
import { getRequestAuth, getRequestProfile } from '@/lib/auth/request-session'
import { WanderMobileAccountMenu } from '@/components/wander/WanderMobileAccountMenu'

export async function WanderMobileAccountSlotServer() {
  const { user } = await getRequestAuth()
  if (!user) return <Link href="/login?redirectTo=%2F" className="rounded-full border border-white/14 bg-black/20 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-md">Sign in</Link>

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
