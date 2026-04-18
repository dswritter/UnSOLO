export const revalidate = 86400

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-black mb-2">Privacy <span className="text-primary">Policy</span></h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: 17 April 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-foreground/90">
          <section>
            <h2 className="text-lg font-bold text-foreground">1. Overview</h2>
            <p>UnSOLO (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) respects your privacy. This policy explains how we collect, use, store, and protect your personal information when you use unsolo.in and related services.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">2. Information We Collect</h2>
            <h3 className="text-sm font-semibold mt-3">Information you provide:</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Name, email address, phone number</li>
              <li>Profile information (bio, location, avatar, Instagram handle)</li>
              <li>Date of birth (for age-based trip preferences)</li>
              <li>UPI ID or bank details (for host payouts only)</li>
              <li>Booking details, travel preferences, and reviews</li>
              <li>Messages sent through our chat system</li>
            </ul>
            <h3 className="text-sm font-semibold mt-3">Information collected automatically:</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Device information and browser type</li>
              <li>IP address and approximate location</li>
              <li>Pages visited and actions taken on the platform</li>
              <li>Online/offline status for real-time features</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">3. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To create and manage your account</li>
              <li>To process bookings and payments via Razorpay</li>
              <li>To facilitate communication between travelers and hosts</li>
              <li>To send booking confirmations, reminders, and notifications</li>
              <li>To verify host identity (phone OTP, email verification)</li>
              <li>To display leaderboard rankings and travel achievements</li>
              <li>To improve our platform and user experience</li>
              <li>To prevent fraud and ensure platform safety</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">4. Phone Number Privacy</h2>
            <p>Your phone number is private by default. Other users cannot see your number unless:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>You explicitly set your number as &quot;public&quot; in profile settings.</li>
              <li>Another user requests access and you approve the request.</li>
            </ul>
            <p>Admin and support team members can view phone numbers for customer service purposes.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">5. Data Sharing</h2>
            <p>We do not sell your personal data. We share information only with:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Razorpay:</strong> Payment processing (name, email, phone for transaction completion).</li>
              <li><strong>Resend:</strong> Email delivery service (email address for notifications).</li>
              <li><strong>MSG91:</strong> SMS delivery for OTP verification (phone number).</li>
              <li><strong>Trip Hosts:</strong> Your name and approved profile information when you join a community trip.</li>
              <li><strong>Law Enforcement:</strong> When required by law or court order.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">6. Data Storage &amp; Security</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Data is stored on Supabase (hosted on AWS) with encryption at rest.</li>
              <li>All connections use HTTPS/TLS encryption.</li>
              <li>Passwords are hashed using bcrypt via Supabase Auth.</li>
              <li>Payment card details are never stored on our servers (handled entirely by Razorpay).</li>
              <li>OTP codes expire after 10 minutes and are deleted after verification.</li>
            </ul>
            <h3 className="text-sm font-semibold mt-3">Abuse prevention &amp; automated traffic</h3>
            <p>
              To reduce spam, bots, and platform abuse, we may apply rate limits, risk signals, optional verification
              challenges (such as CAPTCHA or equivalent), and account restrictions. We process related data only as needed
              for security and service integrity, consistent with this policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Access:</strong> Request a copy of your personal data.</li>
              <li><strong>Correct:</strong> Update inaccurate information via your profile.</li>
              <li><strong>Delete:</strong> Request account deletion by contacting us.</li>
              <li><strong>Restrict:</strong> Limit how we use your data.</li>
              <li><strong>Withdraw consent:</strong> Opt out of non-essential communications.</li>
            </ul>
            <p>To exercise these rights, email <a href="mailto:hello@unsolo.in" className="text-primary hover:underline">hello@unsolo.in</a>.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">8. Cookies</h2>
            <p>We use essential cookies for authentication and session management. We do not use third-party advertising cookies.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">9. Children&apos;s Privacy</h2>
            <p>UnSOLO is not intended for users under 18 years of age. We do not knowingly collect data from minors.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">10. Changes to This Policy</h2>
            <p>We may update this policy periodically. Changes will be posted on this page with an updated date. Continued use of the platform constitutes acceptance of the revised policy.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">11. Contact</h2>
            <p>For privacy-related queries, contact us at <a href="mailto:hello@unsolo.in" className="text-primary hover:underline">hello@unsolo.in</a>.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
