'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createOfferPageSection, moveOfferPageSection, toggleOfferPageSection, updateOfferPageSectionDiscounts } from '@/actions/offers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Section = {
  id: string
  slug: string
  title: string
  subtitle: string | null
  source_type: 'manual_discounts' | 'auto_bundle'
  bundle_kind: 'trip_stay' | 'trip_activity' | 'trip_rental' | 'stay_activity' | 'stay_rental' | 'rental_activity' | null
  hero_badge: string | null
  is_active: boolean
  position_order: number
}

type Offer = {
  id: string
  name: string
  type: string
  discount_paise: number
  promo_code: string | null
  is_active: boolean
}

export function OffersAdminClient({
  sections,
  offers,
  sectionItems,
}: {
  sections: Section[]
  offers: Offer[]
  sectionItems: Array<{ section_id: string; discount_offer_id: string; position_order: number }>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [heroBadge, setHeroBadge] = useState('')
  const [sourceType, setSourceType] = useState<'manual_discounts' | 'auto_bundle'>('manual_discounts')
  const [bundleKind, setBundleKind] = useState<Section['bundle_kind']>('trip_stay')

  const selectedBySection = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const row of sectionItems) {
      const list = map.get(row.section_id) || []
      list.push(row.discount_offer_id)
      map.set(row.section_id, list)
    }
    return map
  }, [sectionItems])

  function handleCreate() {
    if (!title.trim() || !slug.trim()) return
    startTransition(async () => {
      const res = await createOfferPageSection({
        title: title.trim(),
        slug: slug.trim(),
        subtitle: subtitle.trim() || undefined,
        heroBadge: heroBadge.trim() || undefined,
        sourceType,
        bundleKind: sourceType === 'auto_bundle' ? bundleKind : null,
      })
      if ('error' in res && res.error) {
        setMessage(String(res.error))
        return
      }
      router.refresh()
      setMessage('Section created.')
      setTitle('')
      setSlug('')
      setSubtitle('')
      setHeroBadge('')
    })
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-border bg-card/50 p-5">
        <h2 className="text-lg font-semibold">Create offer section</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Section title" />
          <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="section-slug" />
          <Input value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="Subtitle (optional)" />
          <Input value={heroBadge} onChange={e => setHeroBadge(e.target.value)} placeholder="Badge (optional)" />
          <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={sourceType} onChange={e => setSourceType(e.target.value as 'manual_discounts' | 'auto_bundle')}>
            <option value="manual_discounts">Manual discounts</option>
            <option value="auto_bundle">Auto bundle</option>
          </select>
          <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={bundleKind || 'trip_stay'} onChange={e => setBundleKind(e.target.value as Section['bundle_kind'])} disabled={sourceType !== 'auto_bundle'}>
            <option value="trip_stay">Trip + Stay</option>
            <option value="trip_activity">Trip + Activity</option>
            <option value="trip_rental">Trip + Rental</option>
            <option value="stay_activity">Stay + Activity</option>
            <option value="stay_rental">Stay + Rental</option>
            <option value="rental_activity">Rental + Activity</option>
          </select>
        </div>
        <Button className="mt-4" onClick={handleCreate} disabled={isPending || !title.trim() || !slug.trim()}>
          {isPending ? 'Saving…' : 'Create section'}
        </Button>
        {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
      </div>

      <div className="space-y-4">
        {sections.map((section, idx) => (
          <div key={section.id} className="rounded-2xl border border-border bg-card/50 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{section.source_type === 'manual_discounts' ? 'Manual discounts' : `Auto bundle · ${section.bundle_kind}`}</div>
                <h3 className="text-lg font-semibold">{section.title}</h3>
                {section.subtitle ? <p className="text-sm text-muted-foreground">{section.subtitle}</p> : null}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={idx === 0 || isPending}
                  onClick={() => startTransition(async () => {
                    const res = await moveOfferPageSection(section.id, 'up')
                    if ('error' in res && res.error) {
                      setMessage(String(res.error))
                      return
                    }
                    router.refresh()
                    setMessage('Section moved.')
                  })}
                >
                  Move up
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={idx === sections.length - 1 || isPending}
                  onClick={() => startTransition(async () => {
                    const res = await moveOfferPageSection(section.id, 'down')
                    if ('error' in res && res.error) {
                      setMessage(String(res.error))
                      return
                    }
                    router.refresh()
                    setMessage('Section moved.')
                  })}
                >
                  Move down
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => startTransition(async () => {
                    const res = await toggleOfferPageSection(section.id, !section.is_active)
                    if ('error' in res && res.error) {
                      setMessage(String(res.error))
                      return
                    }
                    router.refresh()
                    setMessage(`Section ${section.is_active ? 'hidden' : 'activated'}.`)
                  })}
                >
                  {section.is_active ? 'Hide' : 'Show'}
                </Button>
              </div>
            </div>

            {section.source_type === 'manual_discounts' ? (
              <div className="mt-4 rounded-xl border border-border bg-background/60 p-4">
                <p className="mb-3 text-sm font-medium">Choose offers for this section</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {offers.map(offer => {
                    const current = new Set(selectedBySection.get(section.id) || [])
                    return (
                      <label key={offer.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          defaultChecked={current.has(offer.id)}
                          onChange={e => {
                            const next = new Set(selectedBySection.get(section.id) || [])
                            if (e.target.checked) next.add(offer.id)
                            else next.delete(offer.id)
                            startTransition(async () => {
                              const res = await updateOfferPageSectionDiscounts(section.id, Array.from(next))
                              if ('error' in res && res.error) {
                                setMessage(String(res.error))
                                return
                              }
                              router.refresh()
                              setMessage('Section offers updated.')
                            })
                          }}
                        />
                        <span>{offer.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          ₹{(offer.discount_paise / 100).toLocaleString('en-IN')}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">
                This section auto-populates from host-linked combos for <span className="font-medium text-foreground">{section.bundle_kind}</span>.
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
