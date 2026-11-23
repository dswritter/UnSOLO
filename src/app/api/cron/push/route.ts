import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { dispatchPendingPushes } from '@/lib/push/dispatch'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Every few minutes (GitHub Actions, .github/workflows/push-sweep.yml): pushes any notification that
 * wasn't sent inline, e.g. rows written by database triggers or outside a request. Cheap when
 * there's nothing to send (one indexed select).
 */
async function run(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let sent = 0
  // Up to 5 batches per run so a promotion to a few thousand people drains quickly.
  for (let i = 0; i < 5; i++) {
    const r = await dispatchPendingPushes({ limit: 500 })
    sent += r.sent
    if (r.claimed < 500) break
  }
  return NextResponse.json({ sent })
}

export const GET = run
export const POST = run
