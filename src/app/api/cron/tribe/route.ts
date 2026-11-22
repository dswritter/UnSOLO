import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { dispatchPendingPushes } from '@/lib/push/dispatch'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Every 5–15 minutes: expire 72h join requests and 7-day host offers, mark finished plans past,
 * then sweep any notifications that weren't pushed inline. Vercel Cron sends GET.
 */
async function run(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = createServiceRoleClient()
  const { data: expired, error } = await svc.rpc('expire_tribe_items')
  if (error) console.error('[cron/tribe] expire', error.message)
  const pushes = await dispatchPendingPushes({ limit: 500 })
  // Old analytics rows and finished live locations (keeps the small database's disk work down).
  const { data: pruned, error: pruneErr } = await svc.rpc('prune_housekeeping')
  if (pruneErr) console.error('[cron/tribe] prune', pruneErr.message)
  return NextResponse.json({ expired: expired ?? null, pushes, pruned: pruned ?? null })
}

export const GET = run
export const POST = run
