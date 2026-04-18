export const revalidate = 86400

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-black mb-2">Refund &amp; Cancellation <span className="text-primary">Policy</span></h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: 25 March 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-foreground/90">
          <section>
            <h2 className="text-lg font-bold text-foreground">1. UnSOLO Trips (Curated Packages)</h2>

            <h3 className="text-sm font-semibold mt-3">Cancellation by Customer:</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-secondary">
                    <th className="text-left px-4 py-2 border-b border-border">Cancellation Timeline</th>
                    <th className="text-left px-4 py-2 border-b border-border">Refund</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="px-4 py-2 border-b border-border">30+ days before departure</td><td className="px-4 py-2 border-b border-border">Full refund (100%)</td></tr>
                  <tr><td className="px-4 py-2 border-b border-border">15-29 days before departure</td><td className="px-4 py-2 border-b border-border">75% refund</td></tr>
                  <tr><td className="px-4 py-2 border-b border-border">7-14 days before departure</td><td className="px-4 py-2 border-b border-border">50% refund</td></tr>
                  <tr><td className="px-4 py-2 border-b border-border">Less than 7 days</td><td className="px-4 py-2 border-b border-border">No refund</td></tr>
                </tbody>
              </table>
            </div>

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

            <h3 className="text-sm font-semibold mt-3">After Payment:</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Cancellation requests are reviewed by the UnSOLO admin team.</li>
              <li>Refund amount is determined based on the timeline above and host&apos;s cancellation terms.</li>
              <li>The platform fee (15%) is non-refundable.</li>
            </ul>

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
              <li>Platform fee on community trips (15%).</li>
              <li>Bookings cancelled less than 7 days before departure.</li>
              <li>No-shows (failure to join the trip without prior cancellation).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">8. Disputes</h2>
            <p>If you disagree with a refund decision, email us at <a href="mailto:hello@unsolo.in" className="text-primary hover:underline">hello@unsolo.in</a> with your booking ID. We will review and respond within 5 business days.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">9. Contact</h2>
            <p>For refund queries: <a href="mailto:hello@unsolo.in" className="text-primary hover:underline">hello@unsolo.in</a></p>
          </section>
        </div>
      </div>
    </div>
  )
}
