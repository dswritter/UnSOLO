'use client'

import { useEffect, useState, useTransition } from 'react'
import { X, Mountain } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { signInWithGoogle } from '@/actions/auth'

const SESSION_KEY = 'unsolo_signin_prompt_shown'
const DELAY_MS = 5000

export function SignInPrompt({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [visible, setVisible] = useState(false)
  const [loading, startTransition] = useTransition()

  useEffect(() => {
    if (isAuthenticated) return
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem(SESSION_KEY)) return

    const t = setTimeout(() => {
      setVisible(true)
      sessionStorage.setItem(SESSION_KEY, '1')
    }, DELAY_MS)

    return () => clearTimeout(t)
  }, [isAuthenticated])

  if (!visible) return null

  return (
    <div
      className="fixed bottom-6 right-6 z-[200] w-[320px] rounded-2xl border border-border bg-card shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-300"
      role="dialog"
      aria-label="Sign in to UnSOLO"
    >
      <div className="p-5">
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="absolute top-3 right-3 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl font-black">
            <span className="text-primary">UN</span><span className="text-foreground">SOLO</span>
          </span>
        </div>

        <p className="text-sm font-semibold mb-1">Join the community</p>
        <p className="text-xs text-muted-foreground mb-4">
          Sign in to save trips, track bookings, and connect with fellow travellers.
        </p>

        <Button
          className="w-full gap-2"
          disabled={loading}
          onClick={() => startTransition(() => { signInWithGoogle() })}
        >
          <Mountain className="h-4 w-4 text-primary-foreground" />
          {loading ? 'Redirecting…' : 'Continue with Google'}
        </Button>

        <p className="text-[10px] text-muted-foreground text-center mt-3">
          Free to join · No spam
        </p>
      </div>
    </div>
  )
}
