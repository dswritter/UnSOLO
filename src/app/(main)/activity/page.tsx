import { redirect } from 'next/navigation'
import { getRequestAuth } from '@/lib/auth/request-session'
import { toNotification } from '@/lib/tribe/models'
import { encodeCursor } from '@/lib/tribe/cursor'
import { ActivityClient } from '@/components/tribe/ActivityClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Activity · UnSOLO', robots: { index: false } }

export default async function ActivityPage() {
  const { supabase, user } = await getRequestAuth()
  if (!user) redirect('/login?redirectTo=%2Factivity')
  const { data } = await supabase.from('notifications').select('id, type, title, body, link, is_read, metadata, created_at')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(31)
  const rows = (data ?? []) as Record<string, unknown>[]
  const page = rows.slice(0, 30)
  return (
    <ActivityClient
      initial={page.map(toNotification)}
      initialCursor={rows.length > 30 ? encodeCursor({ at: String(page[page.length - 1].created_at) }) : null}
    />
  )
}
