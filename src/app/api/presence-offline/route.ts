import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Tab closed: mark the signed-in user offline (sendBeacon carries the session cookie).
 * Only ever touches your own row; the body's userId is ignored.
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false })
    await supabase.from('user_presence').update({ last_seen: new Date().toISOString(), is_online: false }).eq('user_id', user.id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
