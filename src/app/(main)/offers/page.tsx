import { Gift, Link2 } from 'lucide-react'
import Link from 'next/link'
import { getPublicOfferSections } from '@/actions/offers'

export const dynamic = 'force-dynamic'

export default async function OffersPage() {
  const sections = await getPublicOfferSections()

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] border border-white/12 bg-[linear-gradient(180deg,rgba(255,194,46,0.12),rgba(255,255,255,0.04))] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.2)] backdrop-blur-[44px]">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          <Gift className="h-3.5 w-3.5" />
          Offers
        </div>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">Save on trips, stays, rentals, and combos</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/68 sm:text-base">
          Admin-controlled sections can surface featured platform deals, while auto sections can pull host-linked travel bundles to help travelers book smarter.
        </p>
      </div>

      <div className="mt-6 space-y-6">
        {sections.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-5 py-10 text-center text-white/60">
            No live offers right now. Check back soon.
          </div>
        ) : (
          sections.map(section => (
            <section key={section.id} className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_14px_44px_rgba(0,0,0,0.16)] backdrop-blur-[42px]">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  {section.hero_badge ? (
                    <div className="mb-2 inline-flex rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                      {section.hero_badge}
                    </div>
                  ) : null}
                  <h2 className="text-2xl font-black tracking-tight text-white">{section.title}</h2>
                  {section.subtitle ? <p className="mt-1 text-sm text-white/62">{section.subtitle}</p> : null}
                </div>
              </div>

              {section.offers.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {section.offers.map(offer => (
                    <div key={offer.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-lg font-bold text-white">{offer.name}</p>
                      <p className="mt-1 text-sm text-primary">
                        Save ₹{(offer.discount_paise / 100).toLocaleString('en-IN')}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/60">
                        <span className="rounded-full border border-white/10 px-2 py-1 uppercase">{offer.type}</span>
                        {offer.promo_code ? <span className="rounded-full border border-primary/25 bg-primary/8 px-2 py-1 text-primary">{offer.promo_code}</span> : null}
                        {offer.valid_until ? <span className="rounded-full border border-white/10 px-2 py-1">Till {new Date(offer.valid_until).toLocaleDateString('en-IN')}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {section.combos.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {section.combos.map(combo => (
                    <div key={combo.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-lg font-bold text-white">{combo.title}</p>
                      <p className="mt-1 text-sm text-white/62">{combo.subtitle}</p>
                      <div className="mt-4 space-y-2">
                        <Link href={combo.primaryHref} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white hover:border-primary/30">
                          <span className="truncate">{combo.primaryLabel}</span>
                          <Link2 className="h-3.5 w-3.5 text-primary" />
                        </Link>
                        <Link href={combo.secondaryHref} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white hover:border-primary/30">
                          <span className="truncate">{combo.secondaryLabel}</span>
                          <Link2 className="h-3.5 w-3.5 text-primary" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ))
        )}
      </div>
    </div>
  )
}
