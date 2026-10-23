import { NextResponse } from 'next/server'
import { getAuthHeroMetrics } from '@/lib/wander/wanderQueries'

export const dynamic = 'force-dynamic'

/** Public aggregate counts; CDN-cached so login/signup rarely reach Postgres. */
export async function GET() {
  try {
    return NextResponse.json(await getAuthHeroMetrics(), {
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400' },
    })
  } catch (error) {
    console.error('Auth metrics unavailable:', error)
    return NextResponse.json({ error: 'Metrics unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
