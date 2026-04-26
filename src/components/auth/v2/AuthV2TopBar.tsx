'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, Globe } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const MAIN_LINKS: { href: string; label: string }[] = [
  { href: '/explore', label: 'Explore' },
  { href: '/community', label: 'Community' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/host', label: 'Host' },
]

const MORE_LINKS: { href: string; label: string }[] = [
  { href: '/wander', label: 'Wander' },
  { href: '/tribe', label: 'Tribe' },
  { href: '/bookings', label: 'Bookings' },
]

export function AuthV2TopBar() {
  const router = useRouter()
  return (
    <div className="flex items-center justify-between gap-2">
      <Link href="/" className="shrink-0 text-lg font-black tracking-tight text-white sm:text-xl">
        UNSOLO
      </Link>

      <nav
        className="hidden min-w-0 flex-1 items-center justify-center gap-4 text-[11px] font-semibold text-white/75 md:flex lg:gap-6 lg:text-xs xl:text-sm"
        aria-label="Main"
      >
        {MAIN_LINKS.map(({ href, label }) => (
          <Link key={href} href={href} className="shrink-0 transition-colors hover:text-white">
            {label}
          </Link>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex shrink-0 items-center gap-0.5 text-white/75 outline-none transition-colors hover:text-white">
            More
            <ChevronDown className="h-3.5 w-3.5 opacity-80" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-[10rem] border border-white/10 bg-zinc-950 text-white"
            align="end"
          >
            {MORE_LINKS.map(({ href, label }) => (
              <DropdownMenuItem
                key={href}
                className="cursor-pointer text-white/90 focus:bg-white/10"
                onClick={() => router.push(href)}
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      <div className="flex shrink-0 items-center">
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs font-semibold text-white/85 outline-none transition hover:bg-white/10">
            <Globe className="h-3.5 w-3.5" />
            EN
            <ChevronDown className="h-3 w-3 opacity-70" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-[8rem] border border-white/10 bg-zinc-950 text-white"
            align="end"
          >
            <DropdownMenuItem className="text-white/90 focus:bg-white/10">English (EN)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
