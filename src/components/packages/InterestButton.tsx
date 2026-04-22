'use client'

import { useState } from 'react'
import { Heart } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toggleInterest } from '@/actions/booking'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface InterestButtonProps {
  packageId: string
  initialCount: number
  initialInterested: boolean
  isLoggedIn: boolean
}

export function InterestButton({ packageId, initialCount, initialInterested, isLoggedIn }: InterestButtonProps) {
  const [interested, setInterested] = useState(initialInterested)
  const [count, setCount] = useState(initialCount)
  const [loading, setLoading] = useState(false)
  const [sparkBurst, setSparkBurst] = useState(0)
  const router = useRouter()

  async function handleToggle() {
    if (!isLoggedIn) {
      router.push('/login')
      return
    }
    setLoading(true)
    // Optimistic
    const wasInterested = interested
    setInterested(!wasInterested)
    setCount(c => wasInterested ? c - 1 : c + 1)
    if (!wasInterested) setSparkBurst((k) => k + 1)

    const result = await toggleInterest(packageId)
    if ('error' in result && result.error) {
      toast.error(result.error)
      setInterested(wasInterested)
      setCount(c => wasInterested ? c + 1 : c - 1)
    }
    setLoading(false)
  }

  const label = interested ? 'Remove interest' : "I'm interested in this trip"

  return (
    <div className="flex items-center">
      <button
        onClick={handleToggle}
        disabled={loading}
        aria-label={label}
        title={label}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
          interested
            ? 'bg-red-500/10 border-red-500/40 text-red-400 hover:bg-red-500/20'
            : 'bg-secondary border-border text-muted-foreground hover:text-white hover:border-primary/40'
        }`}
      >
        <span className="relative inline-flex h-5 w-5 items-center justify-center shrink-0">
          <AnimatePresence mode="popLayout">
            {sparkBurst > 0 && (
              <motion.span
                key={sparkBurst}
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ duration: 0.65, ease: 'easeOut' }}
              >
                {Array.from({ length: 10 }).map((_, i) => {
                  const angle = (i / 10) * Math.PI * 2 + 0.35
                  const dist = 26 + (i % 3) * 6
                  return (
                    <motion.span
                      key={i}
                      className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.9)]"
                      initial={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                      animate={{
                        opacity: 0,
                        scale: 0.2,
                        x: Math.cos(angle) * dist,
                        y: Math.sin(angle) * dist,
                      }}
                      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                    />
                  )
                })}
                {['\u2728', '\u2736', '\u00B7', '\u2605', '\u2727'].map((sym, i) => {
                  const angle = (i / 5) * Math.PI * 2 - 0.5
                  const dist = 22
                  return (
                    <motion.span
                      key={`s-${i}`}
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[11px] leading-none"
                      style={{ filter: 'drop-shadow(0 0 4px rgba(251,191,36,0.8))' }}
                      initial={{ opacity: 1, scale: 0.6 }}
                      animate={{
                        opacity: 0,
                        scale: 1.2,
                        x: Math.cos(angle) * dist,
                        y: Math.sin(angle) * dist,
                      }}
                      transition={{ duration: 0.5, ease: 'easeOut', delay: i * 0.02 }}
                    >
                      {sym}
                    </motion.span>
                  )
                })}
              </motion.span>
            )}
          </AnimatePresence>
          <motion.span
            className="inline-flex"
            animate={
              interested
                ? { scale: [1, 1.35, 1], rotate: [0, -12, 12, 0] }
                : { scale: 1, rotate: 0 }
            }
            transition={{ type: 'spring', stiffness: 520, damping: 18, mass: 0.6 }}
          >
            <Heart className={`h-4 w-4 ${interested ? 'fill-red-400 text-red-400' : ''}`} />
          </motion.span>
        </span>
        {count > 0 && (
          <span className={`tabular-nums text-xs px-1.5 py-0.5 rounded-full ${interested ? 'bg-red-500/20' : 'bg-secondary'}`}>
            {count}
          </span>
        )}
      </button>
    </div>
  )
}
