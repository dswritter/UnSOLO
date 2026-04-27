'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const TRAVEL_QUOTES = [
  'The world is a book, and those who do not travel read only one page.',
  'Adventure is worthwhile in itself.',
  'Not all those who wander are lost.',
  'Travel makes one modest. You see what a tiny place you occupy in the world.',
  'Life is either a daring adventure or nothing at all.',
  'The journey of a thousand miles begins with a single step.',
  'Travel far enough, you meet yourself.',
  'To travel is to live.',
  'Jobs fill your pocket, but adventures fill your soul.',
  'Traveling tends to magnify all human emotions.',
]

type AuthLoadingCardProps = {
  /** Line under the spinner */
  message?: string
  /** Extra copy for email sign-up (confirmation flow) */
  showEmailHint?: boolean
  /** How often the quote and progress bar cycle (ms) */
  cycleMs?: number
  className?: string
}

/**
 * Full-screen auth loading state: logo, spinner, status, quote, progress.
 * Uses theme tokens for light / dark.
 */
export function AuthLoadingCard({
  message = 'Preparing your journey, please hold on…',
  showEmailHint = false,
  cycleMs = 6000,
  className,
}: AuthLoadingCardProps) {
  const [quoteIndex, setQuoteIndex] = useState(() => Math.floor(Math.random() * TRAVEL_QUOTES.length))

  useEffect(() => {
    setQuoteIndex(Math.floor(Math.random() * TRAVEL_QUOTES.length))
    const interval = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % TRAVEL_QUOTES.length)
    }, cycleMs)
    return () => clearInterval(interval)
  }, [cycleMs])

  return (
    <div
      className={cn(
        'relative min-h-[100dvh] flex items-center justify-center px-4 py-10',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-background" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_90%_55%_at_50%_-25%,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_55%)] dark:bg-[radial-gradient(ellipse_90%_50%_at_50%_-20%,color-mix(in_srgb,var(--primary)_18%,transparent),transparent_50%)]"
        aria-hidden
      />

      <div
        className="w-full max-w-md"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label="Loading"
      >
        <div className="rounded-2xl border border-border bg-card/95 p-8 sm:p-9 shadow-sm dark:shadow-none dark:ring-1 dark:ring-border/60 text-center">
          <p className="text-3xl sm:text-4xl font-black tracking-tight">
            <span className="text-primary">UN</span>
            <span className="text-foreground">SOLO</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1.5 sm:text-sm">Change the way you travel.</p>

          <div className="mt-8 flex justify-center">
            <Loader2
              className="h-10 w-10 text-primary motion-safe:animate-spin motion-reduce:animate-none"
              strokeWidth={2}
              aria-hidden
            />
          </div>

          <p className="mt-5 text-sm text-muted-foreground leading-snug">{message}</p>

          {showEmailHint ? (
            <p className="text-xs text-muted-foreground mt-3 max-w-sm mx-auto leading-relaxed text-pretty">
              We&apos;ll email you a confirmation link. After you verify, you can sign in and start exploring.
            </p>
          ) : null}

          <div className="mt-6 min-h-[3.5rem] flex items-center justify-center">
            <blockquote
              key={quoteIndex}
              className="text-pretty text-sm font-medium italic text-primary leading-relaxed max-w-prose mx-auto border-l-2 border-primary/35 pl-4 text-left"
            >
              &ldquo;{TRAVEL_QUOTES[quoteIndex]}&rdquo;
            </blockquote>
          </div>

          <div
            className="mt-7 mx-auto w-full max-w-[200px] h-1.5 rounded-full bg-muted overflow-hidden"
            aria-hidden
          >
            <div
              key={quoteIndex}
              className="auth-loading-progress-fill h-full rounded-full bg-primary"
              style={{ animationDuration: `${cycleMs}ms` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
