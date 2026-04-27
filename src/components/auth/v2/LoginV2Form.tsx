'use client'

import Link from 'next/link'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn, signInWithGoogle } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CheckCircle, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { AuthV2SecurityFooter, AuthV2Tabs, GoogleMark } from '@/components/auth/v2/AuthV2FormChrome'

const inputClass =
  'h-11 min-h-11 !border !border-white/20 !bg-zinc-950 !text-white !placeholder:text-white/40 shadow-inner !shadow-black/20 focus-visible:!border-[#fcba03]/50 focus-visible:!ring-2 focus-visible:!ring-[#fcba03]/30 dark:!bg-zinc-950 dark:!text-white dark:!placeholder:text-white/40'

const TRAVEL_QUOTES = [
  'The world is a book, and those who do not travel read only one page.',
  'Adventure is worthwhile in itself.',
  'Not all those who wander are lost.',
]

const inputPlaceholderClass =
  'placeholder:transition-opacity focus:placeholder:opacity-0 focus:placeholder:duration-150'

function LoginV2FormInner() {
  const searchParams = useSearchParams()
  const verified = searchParams.get('verified') === '1'
  const [loading, setLoading] = useState(false)
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [verifiedSessionChecked, setVerifiedSessionChecked] = useState(false)
  const [hasSessionAfterVerify, setHasSessionAfterVerify] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [oauth, setOauth] = useState<false | 'google'>(false)
  const formRef = useRef<HTMLFormElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!verified) return
    const sb = createClient()
    void sb.auth.getSession().then(({ data }) => {
      setHasSessionAfterVerify(!!data.session)
      setVerifiedSessionChecked(true)
    })
  }, [verified])

  useEffect(() => {
    if (!loading) return
    setQuoteIndex(Math.floor(Math.random() * TRAVEL_QUOTES.length))
    const interval = setInterval(() => {
      setQuoteIndex(prev => (prev + 1) % TRAVEL_QUOTES.length)
    }, 6000)
    return () => clearInterval(interval)
  }, [loading])

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const result = await signIn(formData)
    if (result?.error) {
      toast.error(result.error)
      if (passwordRef.current) {
        passwordRef.current.value = ''
        passwordRef.current.focus()
      }
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center py-8 text-center">
        <div className="h-10 w-10 border-[3px] border-[#fcba03] border-t-transparent rounded-full animate-spin" />
        <p className="mt-5 text-sm text-white/60">Preparing your journey, please hold on…</p>
        <p key={quoteIndex} className="mt-6 max-w-sm text-sm italic text-[#fcba03]/90">
          &ldquo;{TRAVEL_QUOTES[quoteIndex]}&rdquo;
        </p>
      </div>
    )
  }

  const showVerifiedBanner = verified && verifiedSessionChecked && hasSessionAfterVerify
  const showVerifiedNoSession = verified && verifiedSessionChecked && !hasSessionAfterVerify

  return (
    <>
      <div className="mb-1">
        <h2 className="text-lg font-bold text-white md:text-xl">
          <span className="text-[#fcba03]">Log in</span> to continue
        </h2>
        <p className="mt-1 text-sm text-white/50">Access your account and pick up where you left off.</p>
      </div>

      <AuthV2Tabs active="login" />

      {verified && !verifiedSessionChecked ? <div className="mb-4 h-16 rounded-xl bg-zinc-800/80 animate-pulse" aria-hidden /> : null}
      {showVerifiedBanner ? (
        <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex gap-3 text-left">
          <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-sm font-bold text-emerald-500">Email verified</p>
            <p className="text-xs text-white/60 leading-relaxed">You&apos;re signed in. Head to the app whenever you&apos;re ready.</p>
            <Button className="w-full h-9 bg-[#fcba03] text-black text-sm font-bold hover:bg-[#fcba03]/90" asChild>
              <Link href="/explore">Continue to UnSOLO</Link>
            </Button>
          </div>
        </div>
      ) : null}
      {showVerifiedNoSession ? (
        <div className="mb-4 rounded-xl border border-[#fcba03]/30 bg-[#fcba03]/10 p-4 text-left">
          <p className="text-sm font-bold text-[#fcba03]">Email verified</p>
          <p className="text-xs text-white/60 mt-1 leading-relaxed">
            Sign in below with the email and password you used to register.
          </p>
        </div>
      ) : null}

      <form onSubmit={handleEmailSubmit} ref={formRef} className="space-y-3.5">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-white/80" htmlFor="auth-v2-email">
            Email
          </label>
          <Input
            id="auth-v2-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="hello@unsolo.in"
            required
            className={`${inputClass} ${inputPlaceholderClass}`}
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-white/80" htmlFor="auth-v2-password">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs font-semibold text-[#fcba03] hover:underline">
              Forgot?
            </Link>
          </div>
          <div className="relative">
            <Input
              ref={passwordRef}
              id="auth-v2-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              className={`${inputClass} pr-10 ${inputPlaceholderClass}`}
            />
            <button
              type="button"
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-white/45 hover:text-white"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Button
          type="submit"
          className="mt-1 h-11 w-full bg-[#fcba03] text-base font-extrabold text-black shadow-lg shadow-[#fcba03]/20 hover:bg-[#fcba03]/90"
        >
          Log In
        </Button>
      </form>

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/10" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-zinc-950/90 px-3 text-white/40">or continue with</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        disabled={!!oauth}
        className="h-11 w-full border-white/20 bg-transparent text-white hover:bg-white/5"
        onClick={() => {
          setOauth('google')
          signInWithGoogle()
        }}
      >
        <GoogleMark className="mr-2 h-4 w-4" />
        {oauth === 'google' ? '…' : 'Continue with Google'}
      </Button>

      <p className="mt-4 text-center text-sm text-white/50">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-semibold text-[#fcba03] hover:underline">
          Sign up
        </Link>
      </p>

      <AuthV2SecurityFooter />
    </>
  )
}

export function LoginV2Form() {
  return (
    <Suspense fallback={<div className="min-h-[280px] animate-pulse rounded-lg bg-zinc-800/50" aria-hidden />}>
      <LoginV2FormInner />
    </Suspense>
  )
}
