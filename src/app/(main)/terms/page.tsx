export const revalidate = 86400

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-black mb-2">Terms of <span className="text-primary">Service</span></h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: 25 March 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-foreground/90">
          <section>
            <h2 className="text-lg font-bold text-foreground">1. Introduction</h2>
            <p>Welcome to UnSOLO (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), operated via unsolo.in. By accessing or using our platform, you agree to these Terms of Service. If you do not agree, please do not use our services.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">2. Eligibility</h2>
            <p>You must be at least 18 years old and a resident of India to use UnSOLO. By registering, you confirm that the information you provide is accurate and complete.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">3. Services</h2>
            <p>UnSOLO is a travel platform that enables:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>UnSOLO Trips:</strong> Curated travel packages managed by our team.</li>
              <li><strong>Community Trips:</strong> Trips hosted by verified users on our platform. UnSOLO acts as a marketplace facilitator, not the trip organizer.</li>
              <li><strong>Group Bookings:</strong> Split payment functionality for group travel.</li>
              <li><strong>Communication:</strong> Real-time chat between travelers and trip hosts.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">4. Accounts</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
              <li>You must not share your account or impersonate another person.</li>
              <li>We reserve the right to suspend or terminate accounts that violate these terms.</li>
              <li>Username changes are limited to once every 40 days.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">5. Bookings &amp; Payments</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>All payments are processed through Razorpay in Indian Rupees (INR).</li>
              <li>Booking confirmation is subject to availability and payment verification.</li>
              <li>For group bookings, all members must complete payment within 24 hours of group creation, or the booking will be auto-cancelled with full refund.</li>
              <li>Prices displayed include applicable taxes unless stated otherwise.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">6. Community Trip Hosting</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Hosts must complete phone and email verification before creating trips.</li>
              <li>All community trips are subject to admin approval before being listed.</li>
              <li>UnSOLO charges a platform fee on community trip bookings; the percentage is set by UnSOLO and applied as part of the listed trip price (not as a separate add-on at checkout).</li>
              <li>Hosts are responsible for the accuracy of their trip descriptions, itineraries, and inclusions.</li>
              <li>UnSOLO is not liable for the quality, safety, or execution of community-hosted trips.</li>
              <li>Hosts must not engage in misleading, fraudulent, or unsafe practices.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">7. Cancellations &amp; Refunds</h2>
            <p>Please refer to our <a href="/refund-policy" className="text-primary hover:underline">Refund &amp; Cancellation Policy</a> for detailed information.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">8. User Conduct</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Post false, misleading, or offensive content.</li>
              <li>Harass, threaten, or abuse other users.</li>
              <li>Use the platform for illegal activities.</li>
              <li>Attempt to bypass payment systems or platform fees.</li>
              <li>Scrape, copy, or reverse-engineer the platform.</li>
              <li>Create fake accounts or manipulate reviews/ratings.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">9. Intellectual Property</h2>
            <p>All content, design, and technology on UnSOLO is owned by us. User-generated content (reviews, photos, messages) remains yours, but you grant us a non-exclusive license to display it on the platform.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">10. Limitation of Liability</h2>
            <p>UnSOLO is a platform that connects travelers. We are not a travel agency and do not guarantee the quality of any trip. To the maximum extent permitted by law, UnSOLO shall not be liable for any indirect, incidental, or consequential damages arising from use of our services.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">11. Dispute Resolution</h2>
            <p>Any disputes arising from use of UnSOLO shall be governed by the laws of India. Courts in New Delhi shall have exclusive jurisdiction.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">12. Changes to Terms</h2>
            <p>We may update these terms from time to time. Continued use of the platform after changes constitutes acceptance. We will notify users of significant changes via email or in-app notification.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">13. Contact</h2>
            <p>For questions about these terms, contact us at <a href="mailto:hello@unsolo.in" className="text-primary hover:underline">hello@unsolo.in</a>.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
