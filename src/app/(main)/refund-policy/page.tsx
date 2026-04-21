import { createClient } from '@/lib/supabase/server'
import {
  REFUND_TIER_SETTING_KEYS,
  defaultTiersFor,
  parseRefundTiersJson,
  tierRefundLabel,
  tierTimelineLabel,
  type RefundTier,
  type RefundTierCategory,
} from '@/lib/refund-tiers'

export const revalidate = 3600

const CATEGORIES: RefundTierCategory[] = ['unsolo', 'host', 'stays', 'activities', 'rentals']

async function loadAllRefundTiers(): Promise<Record<RefundTierCategory, RefundTier[]>> {
  const supabase = await createClient()
  const keys = CATEGORIES.map((c) => REFUND_TIER_SETTING_KEYS[c])
  const { data } = await supabase.from('platform_settings').select('key, value').in('key', keys)
  const byKey = Object.fromEntries((data || []).map((r) => [r.key, r.value as string]))
  const out = {} as Record<RefundTierCategory, RefundTier[]>
  for (const c of CATEGORIES) {
    out[c] = parseRefundTiersJson(byKey[REFUND_TIER_SETTING_KEYS[c]], defaultTiersFor(c))
  }
  return out
}

function TierTable({ tiers }: { tiers: RefundTier[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-secondary">
            <th className="text-left px-4 py-2 border-b border-border">Cancellation timeline</th>
            <th className="text-left px-4 py-2 border-b border-border">Refund</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((t, i) => (
            <tr key={i}>
              <td className="px-4 py-2 border-b border-border">{tierTimelineLabel(t)}</td>
              <td className="px-4 py-2 border-b border-border">{tierRefundLabel(t.percent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function RefundPolicyPage() {
  const tiers = await loadAllRefundTiers()

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-black mb-2">
          Refund &amp; Cancellation <span className="text-primary">Policy</span>
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Tier schedules are maintained live by UnSOLO admins; the tables below reflect the current values.
        </p>

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 mb-8">
          <h2 className="text-sm font-bold text-foreground">Fair-split refunds</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            When a traveler cancels, UnSOLO and the host share the refund <strong>proportionally</strong> to our
            earnings on the booking. Platform fees, promos, and referral credits never come out of the host&apos;s
            share. If a host was already paid an advance, any clawback stops at their unpaid balance — the platform
            absorbs the rest.
          </p>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-foreground/90">
          <section>
            <h2 className="text-lg font-bold text-foreground">1. UnSOLO Trips (Curated Packages)</h2>
            <h3 className="text-sm font-semibold mt-3">Cancellation by Customer:</h3>
            <TierTable tiers={tiers.unsolo} />
            <h3 className="text-sm font-semibold mt-3">Cancellation by UnSOLO:</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>If UnSOLO cancels a trip due to insufficient participants, weather, or safety concerns, a full refund (100%) will be issued.</li>
              <li>We will notify you at least 7 days before the departure date when possible.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">2. Community Trips (Hosted by Users)</h2>
            <h3 className="text-sm font-semibold mt-3">Before Host Approval:</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>No payment is made until the host approves your join request.</li>
              <li>You can withdraw your request at any time with no charges.</li>
            </ul>
            <h3 className="text-sm font-semibold mt-3">After Payment (admin-reviewed cancellations):</h3>
            <TierTable tiers={tiers.host} />
            <h3 className="text-sm font-semibold mt-3">Cancellation by Host:</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>If the host cancels the trip, all participants receive a full refund.</li>
              <li>Repeated cancellations by a host may result in account suspension.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">3. Stays</h2>
            <p className="text-sm text-muted-foreground">Homestays, cabins, hotels — refund timeline is measured against your check-in date.</p>
            <TierTable tiers={tiers.stays} />
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">4. Activities</h2>
            <p className="text-sm text-muted-foreground">Day tours, workshops, classes — refund timeline is measured against the activity start time.</p>
            <TierTable tiers={tiers.activities} />
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">5. Rentals</h2>
            <p className="text-sm text-muted-foreground">Bikes, scooters, gear, vehicles — refund timeline is measured against your pickup time (sub-day precision applies).</p>
            <TierTable tiers={tiers.rentals} />
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">6. Group Bookings</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>All group members must complete payment within 24 hours of group creation.</li>
              <li>If any member fails to pay within the deadline, the entire group booking is auto-cancelled with full refund for those who paid.</li>
              <li>Individual cancellation from a group follows the tier schedule for the booking&apos;s category.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">7. Refund Process</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Refunds are processed to the original payment method (UPI, card, or netbanking).</li>
              <li>UPI refunds: 1–3 business days.</li>
              <li>Card refunds: 5–7 business days.</li>
              <li>Netbanking refunds: 5–10 business days.</li>
              <li>You will receive a notification when the refund is initiated and when it is processed.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">8. Non-Refundable Items</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Bookings cancelled inside the &quot;no refund&quot; window of the schedule above.</li>
              <li>No-shows (failure to show up without prior cancellation).</li>
              <li>Payment-gateway fees charged by the card/UPI network (typically ~2% of the booking, passed through).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">9. Disputes &amp; Contact</h2>
            <p>
              If you disagree with a refund decision, email us at{' '}
              <a href="mailto:hello@unsolo.in" className="text-primary hover:underline">hello@unsolo.in</a>{' '}
              with your booking ID. We will review and respond within 5 business days.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
