'use client'

// This thin client-component wrapper is required because `next/dynamic` with
// `ssr: false` is only allowed inside Client Components (not Server Components).
// The packages/[slug]/page.tsx is a Server Component, so it imports this
// wrapper instead of using `dynamic` directly.
import dynamic from 'next/dynamic'

export const LazyInterestButton = dynamic(
  () => import('./InterestButton').then((m) => ({ default: m.InterestButton })),
  {
    ssr: false,
    loading: () => <div className="h-10 w-36 rounded-xl bg-secondary animate-pulse" />,
  },
)
