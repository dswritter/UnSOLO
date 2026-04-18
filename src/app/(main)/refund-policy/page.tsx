import { createClient } from '@/lib/supabase/server'
import {
  defaultHostRefundTiers,
  defaultUnsoloRefundTiers,
  parseRefundTiersJson,
  tierRefundLabel,
  tierTimelineLabel,
  type RefundTier,
} from '@/lib/refund-tiers'

export const revalidate = 3600

async function loadRefundTiers(): Promise<{ unsolo: RefundTier[]; host: RefundTier[] }> {
  const supabase = await createClient()
  const { data } = await supabase.from('platform_settings').select('key, value').in('key', ['refund_tiers_unsolo', 'refund_tiers_host'])
  const map = Object.fromEntries((data || []).map((r) => [r.key, r.value as string]))
  return {
    unsolo: parseRefundTiersJson(map.refund_tiers_unsolo, defaultUnsoloRefundTiers()),
    host: parseRefundTiersJson(map.refund_tiers_host, defaultHostRefundTiers()),
  }
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
  const { unsolo, host } = await loadRefundTiers()

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-black mb-2">
          Refund &amp; Cancellation <span className="text-primary">Policy</span>
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Last updated: 17 April 2026 · Tier tables below are maintained by UnSOLO and may change; the live values also appear
          in admin settings.
        </p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-foreground/90">
          <section>
            <h2 className="text-lg font-bold text-foreground">1. UnSOLO Trips (Curated Packages)</h2>

            <h3 className="text-sm font-semibold mt-3">Cancellation by Customer:</h3>
            <TierTable tiers={unsolo} />

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
            <p className="text-sm text-muted-foreground">
              Refund percentages for community trips follow the schedule below unless your booking notes otherwise. The
              platform fee portion may still be non-refundable (see Non-Refundable Items).
            </p>
            <TierTable tiers={host} />

            <h3 className="text-sm font-semibold mt-3">Cancellation by Host:</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>If the host cancels the trip, all participants receive a full refund including the platform fee.</li>
              <li>Repeated cancellations by a host may result in account suspension.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">3. Group Bookings</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>All group members must complete payment within 24 hours of group creation.</li>
              <li>If any member fails to pay within the deadline, the entire group booking is auto-cancelled with full refund for those who paid.</li>
              <li>Individual cancellation from a group follows the standard cancellation timeline above.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">4. Refund Process</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Refunds are processed to the original payment method (UPI, card, or netbanking).</li>
              <li>UPI refunds: 1-3 business days.</li>
              <li>Card refunds: 5-7 business days.</li>
              <li>Netbanking refunds: 5-10 business days.</li>
              <li>You will receive a notification when the refund is initiated and when it is processed.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">5. How to Request Cancellation</h2>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Go to <strong>My Trips</strong> in your account.</li>
              <li>Select the booking you want to cancel.</li>
              <li>Click <strong>&quot;Request Cancellation&quot;</strong> and provide a reason.</li>
              <li>Our team will review and process the request within 24-48 hours.</li>
              <li>You will be notified of the refund amount and timeline.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">6. Date Changes</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Date changes are allowed for pending bookings (before admin confirmation).</li>
              <li>Once a booking is confirmed, date changes require cancellation and rebooking.</li>
              <li>Date changes are subject to availability.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">7. Non-Refundable Items</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Platform fee on community trips (rate determined by UnSOLO).</li>
              <li>Bookings cancelled inside the &quot;no refund&quot; window of the schedule above.</li>
              <li>No-shows (failure to join the trip without prior cancellation).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">8. Disputes</h2>
            <p>
              If you disagree with a refund decision, email us at{' '}
              <a href="mailto:hello@unsolo.in" className="text-primary hover:underline">
                hello@unsolo.in
              </a>{' '}
              with your booking ID. We will review and respond within 5 business days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">9. Contact</h2>
            <p>
              For refund queries:{' '}
              <a href="mailto:hello@unsolo.in" className="text-primary hover:underline">
                hello@unsolo.in
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
