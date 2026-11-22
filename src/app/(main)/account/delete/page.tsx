import Link from 'next/link'

export const revalidate = 86400
export const metadata = {
  title: 'Delete your account · UnSOLO',
  description: 'How to delete your UnSOLO account and what happens to your data.',
}

/** Public page for app-store listings: how to delete an account, and what is deleted or kept. */
export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="mb-2 text-3xl font-black">Delete your UnSOLO account</h1>
        <p className="mb-8 text-muted-foreground">You can delete your account yourself at any time, from the website or the app.</p>

        <div className="space-y-8 text-foreground/90">
          <section>
            <h2 className="mb-2 text-lg font-bold text-foreground">How to delete it</h2>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li><b>Website:</b> sign in, open <Link href="/settings#delete" className="font-semibold text-primary hover:underline">Settings</Link>, scroll to <b>Delete account</b>, type DELETE and confirm.</li>
              <li><b>Android or iPhone app:</b> open <b>You → Settings → Delete account</b>.</li>
              <li><b>Can’t sign in?</b> Email <a href="mailto:hello@unsolo.in?subject=Delete%20my%20account" className="font-semibold text-primary hover:underline">hello@unsolo.in</a> from the email or phone number on your account. We delete it within 7 days.</li>
            </ol>
            <p className="mt-3 text-sm text-muted-foreground">If you have a trip coming up, or live trips or listings as a host, cancel or pause them first. Refunds follow each trip’s cancellation policy.</p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold text-foreground">What is deleted straight away</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>Your sign-in: email, phone number, and Google or Apple sign-in</li>
              <li>Your profile: name, photo, bio, date of birth, gender and home city</li>
              <li>Tribe posts, stories, comments, poll votes, reactions, saved posts, plans you joined and follows</li>
              <li>Chat messages, notifications, devices, preferences and points</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold text-foreground">What we keep, and why</h2>
            <p>Records of bookings and payments are kept for up to 8 years, because Indian tax and accounting law requires it. They no longer show your name: traveller names and special requests are removed, and they are linked only to an anonymous “Deleted traveller”. Reviews you wrote stay up under that name.</p>
          </section>

          <p className="text-sm text-muted-foreground">Questions? <a href="mailto:hello@unsolo.in" className="text-primary hover:underline">hello@unsolo.in</a> · <Link href="/privacy" className="text-primary hover:underline">Privacy policy</Link></p>
        </div>
      </div>
    </div>
  )
}
