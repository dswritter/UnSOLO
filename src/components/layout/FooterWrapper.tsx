'use client'

import { usePathname } from 'next/navigation'

export function FooterWrapper() {
  const pathname = usePathname()

  // Hide footer on chat pages
  if (pathname?.startsWith('/chat') || pathname?.startsWith('/community')) return null

  return (
    <footer className="border-t border-border bg-card/50 mt-auto">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
          <div>
            <h4 className="font-bold text-foreground mb-3">UnSOLO</h4>
            <p className="text-muted-foreground text-xs leading-relaxed">Change the way you travel. Connect with solo travelers across India.</p>
          </div>
          <div>
            <h4 className="font-bold text-foreground mb-3">Explore</h4>
            <ul className="space-y-1.5">
              <li><a href="/explore" className="text-muted-foreground hover:text-primary text-xs">UnSOLO Trips</a></li>
              <li><a href="/explore?tab=community" className="text-muted-foreground hover:text-primary text-xs">Community Trips</a></li>
              <li><a href="/leaderboard" className="text-muted-foreground hover:text-primary text-xs">Leaderboard</a></li>
              <li><a href="/community" className="text-muted-foreground hover:text-primary text-xs">Community</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-foreground mb-3">Host</h4>
            <ul className="space-y-1.5">
              <li><a href="/host" className="text-muted-foreground hover:text-primary text-xs">Host Dashboard</a></li>
              <li><a href="/host/verify" className="text-muted-foreground hover:text-primary text-xs">Become a Host</a></li>
              <li><a href="/contact" className="text-muted-foreground hover:text-primary text-xs">Contact Us</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-foreground mb-3">Legal</h4>
            <ul className="space-y-1.5">
              <li><a href="/terms" className="text-muted-foreground hover:text-primary text-xs">Terms of Service</a></li>
              <li><a href="/privacy" className="text-muted-foreground hover:text-primary text-xs">Privacy Policy</a></li>
              <li><a href="/refund-policy" className="text-muted-foreground hover:text-primary text-xs">Refund Policy</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} UnSOLO. All rights reserved.</p>
          <p className="text-xs text-muted-foreground">Made with passion for solo travelers</p>
        </div>
      </div>
    </footer>
  )
}
