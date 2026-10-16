import { tripDepartureDateKey } from '@/lib/package-trip-calendar'

export type HostAttentionTrip = {
  id: string
  title: string
  moderation_status: string | null
  pending_requests: number
  departure_dates: string[] | null
  departure_dates_closed?: string[] | null
}

export type HostAttentionListing = { id: string; title: string; status: string | null }

export type HostAttentionItem = { id: string; text: string; href: string; cta: string; tone: 'action' | 'warning' }

export function hostAttentionItems(input: {
  trips: HostAttentionTrip[]
  serviceListings: HostAttentionListing[]
  payoutConfigured: boolean
}): HostAttentionItem[] {
  const items: HostAttentionItem[] = []
  if (!input.payoutConfigured) {
    items.push({ id: 'payout', text: 'Add a UPI ID or bank account to publish listings and get paid', href: '/host/payout', cta: 'Set up payout', tone: 'warning' })
  }
  for (const t of input.trips) {
    if (t.pending_requests > 0) {
      const n = t.pending_requests
      items.push({ id: `req-${t.id}`, text: `${n} join request${n === 1 ? '' : 's'} waiting on ${t.title}`, href: `/host/${t.id}`, cta: 'Review', tone: 'action' })
    }
  }
  for (const t of input.trips) {
    if (t.moderation_status === 'rejected') {
      items.push({ id: `rej-${t.id}`, text: `${t.title} needs changes before it can go live`, href: `/host/${t.id}/edit`, cta: 'Edit trip', tone: 'warning' })
    }
  }
  for (const l of input.serviceListings) {
    if (l.status === 'rejected') {
      items.push({ id: `svc-${l.id}`, text: `${l.title} needs changes before it can go live`, href: `/host/service-listings/${l.id}/edit`, cta: 'Edit listing', tone: 'warning' })
    }
  }
  return items
}

export type HostDeparture = { tripId: string; title: string; date: string }

/** Next open departures across all of the host's trips, soonest first. */
export function hostUpcomingDepartures(trips: HostAttentionTrip[], todayIso: string, limit = 5): HostDeparture[] {
  const out: HostDeparture[] = []
  for (const t of trips) {
    const closed = new Set((t.departure_dates_closed || []).map(tripDepartureDateKey))
    for (const d of t.departure_dates || []) {
      const k = tripDepartureDateKey(d)
      if (k >= todayIso && !closed.has(k)) out.push({ tripId: t.id, title: t.title, date: k })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit)
}
