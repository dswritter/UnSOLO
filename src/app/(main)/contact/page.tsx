import { Mail, MapPin, Clock } from 'lucide-react'
import Link from 'next/link'

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-black">
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-4xl font-black mb-2">
          Get in <span className="text-primary">Touch</span>
        </h1>
        <p className="text-muted-foreground mb-12">
          Have a question, partnership idea, or just want to say hi? We&apos;d love to hear from you.
        </p>

        <div className="grid gap-6">
          {/* Email Card */}
          <a
            href="mailto:unsolo.in@gmail.com"
            className="flex items-start gap-4 p-6 rounded-xl border border-border bg-card hover:border-primary/50 transition-colors group"
          >
            <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-lg group-hover:text-primary transition-colors">Email Us</h3>
              <p className="text-primary font-medium mt-1">unsolo.in@gmail.com</p>
              <p className="text-sm text-muted-foreground mt-1">
                For bookings, partnerships, or general enquiries.
              </p>
            </div>
          </a>

          {/* Response Time */}
          <div className="flex items-start gap-4 p-6 rounded-xl border border-border bg-card">
            <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <Clock className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Response Time</h3>
              <p className="text-sm text-muted-foreground mt-1">
                We typically respond within <strong className="text-white">24–48 hours</strong>. For urgent booking queries, mention your confirmation code in the subject.
              </p>
            </div>
          </div>

          {/* Based In */}
          <div className="flex items-start gap-4 p-6 rounded-xl border border-border bg-card">
            <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <MapPin className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Based in India</h3>
              <p className="text-sm text-muted-foreground mt-1">
                We curate trips across India — from the Himalayas to the backwaters of Kerala.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">
            Already booked a trip? Chat with your trip-mates in the{' '}
            <Link href="/chat" className="text-primary hover:underline">Community</Link>.
          </p>
        </div>
      </div>
    </div>
  )
}
