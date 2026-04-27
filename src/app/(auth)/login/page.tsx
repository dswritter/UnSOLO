'use client'

import Link from 'next/link'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn, signInWithGoogle } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mountain, CheckCircle, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { AuthLoadingCard } from '@/components/auth/AuthLoadingCard'

const inputPlaceholderClass =
  'placeholder:transition-opacity focus:placeholder:opacity-0 focus:placeholder:duration-150'

function LoginPageInner() {
  const searchParams = useSearchParams()
  const verified = searchParams.get('verified') === '1'
  const [loading, setLoading] = useState(false)
  const [verifiedSessionChecked, setVerifiedSessionChecked] = useState(false)
  const [hasSessionAfterVerify, setHasSessionAfterVerify] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
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

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const result = await signIn(formData)
    if (result?.error) {
      toast.error(result.error)
      // Clear only password field on error, keep email intact
      if (passwordRef.current) {
        passwordRef.current.value = ''
        passwordRef.current.focus()
      }
      setLoading(false)
    }
  }

  if (loading) {
    return <AuthLoadingCard />
  }

  const showVerifiedBanner = verified && verifiedSessionChecked && hasSessionAfterVerify
  const showVerifiedNoSession = verified && verifiedSessionChecked && !hasSessionAfterVerify

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/">
            <span className="text-4xl font-black">
              <span className="text-primary">UN</span><span className="text-foreground">SOLO</span>
            </span>
          </Link>
          <p className="text-muted-foreground text-sm mt-2">Change the way you travel.</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 space-y-6">
          {verified && !verifiedSessionChecked ? (
            <div className="h-16 rounded-xl bg-secondary/60 animate-pulse" aria-hidden />
          ) : null}
          {showVerifiedBanner ? (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 flex gap-3 text-left">
              <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Email verified</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  You&apos;re signed in. Head to the app whenever you&apos;re ready.
                </p>
                <Button className="w-full bg-primary text-black font-bold h-9 text-sm" asChild>
                  <Link href="/explore">Continue to UnSOLO</Link>
                </Button>
              </div>
            </div>
          ) : null}

          {showVerifiedNoSession ? (
            <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-left">
              <p className="text-sm font-bold text-primary">Email verified</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Sign in below with the email and password you used to register.
              </p>
            </div>
          ) : null}

          <div>
            <h1 className="text-2xl font-bold">Welcome back</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full border-border"
            onClick={() => { setLoading(true); signInWithGoogle() }}
          >
            <Mountain className="mr-2 h-4 w-4 text-primary" />
            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-card px-3 text-muted-foreground">or continue with email</span></div>
          </div>

          <form onSubmit={handleEmailSubmit} ref={formRef} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Email</label>
              <Input
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                className={`bg-secondary border-border ${inputPlaceholderClass}`}
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Password</label>
                <Link href="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
              </div>
              <div className="relative">
                <Input
                  ref={passwordRef}
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Your password"
                  required
                  className={`bg-secondary border-border pr-10 ${inputPlaceholderClass}`}
                />
                <button
                  type="button"
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full bg-primary text-black font-bold hover:bg-primary/90">Sign In</Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-primary font-medium hover:underline">Sign up free</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginPageInner />
    </Suspense>
  )
}
