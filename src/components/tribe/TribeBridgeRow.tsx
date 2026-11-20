import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public-client'

/**
 * Explore → Tribe bridge (spec growth loop 3): "14 people are planning Himachal". Only places
 * with ≥ 3 live plans are named (small-number rule); otherwise a generic invitation.
 * Public, cookie-free query so the home page stays cacheable. Renders nothing on error.
 */
export async function TribeBridgeRow() {
  let top: { place: string; slug: string; n: number }[] = []
  try {
    const { data, error } = await createPublicClient().from('posts').select('place_name, place_slug')
      .eq('kind', 'plan').eq('status', 'live').not('place_slug', 'is', null).limit(500)
    if (error) throw error
    const counts = new Map<string, { place: string; slug: string; n: number }>()
    for (const r of data ?? []) {
      const slug = r.place_slug as string
      const cur = counts.get(slug) ?? { place: String(r.place_name), slug, n: 0 }
      cur.n++
      counts.set(slug, cur)
    }
    top = [...counts.values()].filter((c) => c.n >= 3).sort((a, b) => b.n - a.n).slice(0, 3)
  } catch {
    return null
  }
  return (
    <section aria-label="Tribe" className="mx-auto mt-6 max-w-[1280px] px-4 md:px-6">
      <div className="pc-pencilled flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="pc-kicker">Tribe · community plans, not bookings</p>
          <p className="mt-1 font-semibold">
            {top.length ? top.map((t, i) => (
              <span key={t.slug}>{i > 0 && ' · '}<Link className="hover:underline" href={`/tribe?place=${t.slug}`}>{t.n} planning {t.place}</Link></span>
            )) : 'Find people going your way, or share where you’re headed next.'}
          </p>
        </div>
        <Link href="/tribe" className="pc-btn pc-btn-outline pc-btn-sm">Open Tribe</Link>
      </div>
    </section>
  )
}
