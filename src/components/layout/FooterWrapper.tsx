'use client'

import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { wanderSearchHref } from '@/lib/routing/wanderLandingPath'

export function FooterWrapper() {
  const pathname = usePathname()
  const isWander =
    pathname === '/' ||
    pathname?.startsWith('/host') ||
    pathname?.startsWith('/packages') ||
    pathname?.startsWith('/listings') ||
    pathname?.startsWith('/bookings') ||
    pathname?.startsWith('/booking/') ||
    pathname?.startsWith('/book/')

  // Hide footer on full-viewport or chat pages
  if (
    pathname?.startsWith('/chat') ||
    pathname?.startsWith('/community') ||
    pathname?.startsWith('/tribe') ||
    pathname?.startsWith('/leaderboard')
  ) {
    return null
  }

  // Host dashboard, verify, create listing, payout, etc. — match immersive host shell
  if (pathname?.startsWith('/host')) {
    return null
  }

  return (
    <footer
      className={cn(
        'border-t mt-auto',
        isWander ? 'footer-wander-surface border-[#2f4d42]/50' : 'border-border bg-card/50',
      )}
    >
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
          <div>
            <h4 className={cn('font-bold mb-3', isWander ? 'text-white' : 'text-foreground')}>UnSOLO</h4>
            <p className={cn('text-xs leading-relaxed', isWander ? 'text-white/75' : 'text-muted-foreground')}>
              Change the way you travel. Connect with solo travelers across India.
            </p>
          </div>
          <div>
            <h4 className={cn('font-bold mb-3', isWander ? 'text-white' : 'text-foreground')}>Explore</h4>
            <ul className="space-y-1.5">
              <li>
                <a
                  href="/"
                  className={cn('text-xs', isWander ? 'text-white/75 hover:text-[#fcba03]' : 'text-muted-foreground hover:text-primary')}
                >
                  All trips
                </a>
              </li>
              <li>
                <a
                  href={wanderSearchHref({ tab: 'trips', tripSource: 'unsolo' })}
                  className={cn('text-xs', isWander ? 'text-white/75 hover:text-[#fcba03]' : 'text-muted-foreground hover:text-primary')}
                >
                  UnSOLO Trips
                </a>
              </li>
              <li>
                <a
                  href={wanderSearchHref({ tab: 'trips', tripSource: 'community' })}
                  className={cn('text-xs', isWander ? 'text-white/75 hover:text-[#fcba03]' : 'text-muted-foreground hover:text-primary')}
                >
                  Community Trips
                </a>
              </li>
              <li>
                <a
                  href="/leaderboard"
                  className={cn('text-xs', isWander ? 'text-white/75 hover:text-[#fcba03]' : 'text-muted-foreground hover:text-primary')}
                >
                  Leaderboard
                </a>
              </li>
              <li>
                <a
                  href="/community"
                  className={cn('text-xs', isWander ? 'text-white/75 hover:text-[#fcba03]' : 'text-muted-foreground hover:text-primary')}
                >
                  Community
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className={cn('font-bold mb-3', isWander ? 'text-white' : 'text-foreground')}>Host</h4>
            <ul className="space-y-1.5">
              <li>
                <a
                  href="/host"
                  className={cn('text-xs', isWander ? 'text-white/75 hover:text-[#fcba03]' : 'text-muted-foreground hover:text-primary')}
                >
                  Host Dashboard
                </a>
              </li>
              <li>
                <a
                  href="/host/verify"
                  className={cn('text-xs', isWander ? 'text-white/75 hover:text-[#fcba03]' : 'text-muted-foreground hover:text-primary')}
                >
                  Become a Host
                </a>
              </li>
              <li>
                <a
                  href="/contact"
                  className={cn('text-xs', isWander ? 'text-white/75 hover:text-[#fcba03]' : 'text-muted-foreground hover:text-primary')}
                >
                  Contact Us
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className={cn('font-bold mb-3', isWander ? 'text-white' : 'text-foreground')}>Legal</h4>
            <ul className="space-y-1.5">
              <li>
                <a
                  href="/terms"
                  className={cn('text-xs', isWander ? 'text-white/75 hover:text-[#fcba03]' : 'text-muted-foreground hover:text-primary')}
                >
                  Terms of Service
                </a>
              </li>
              <li>
                <a
                  href="/privacy"
                  className={cn('text-xs', isWander ? 'text-white/75 hover:text-[#fcba03]' : 'text-muted-foreground hover:text-primary')}
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="/refund-policy"
                  className={cn('text-xs', isWander ? 'text-white/75 hover:text-[#fcba03]' : 'text-muted-foreground hover:text-primary')}
                >
                  Refund Policy
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className={cn('mt-8 pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-2', isWander ? 'border-[#2f4d42]/50' : 'border-border')}>
          <p className={cn('text-xs', isWander ? 'text-white/65' : 'text-muted-foreground')}>&copy; {new Date().getFullYear()} UnSOLO. All rights reserved.</p>
          <p className={cn('text-xs', isWander ? 'text-white/65' : 'text-muted-foreground')}>Made with passion for solo travelers</p>
        </div>
      </div>
    </footer>
  )
}
