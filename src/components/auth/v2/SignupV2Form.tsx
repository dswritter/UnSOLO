'use client'

import Link from 'next/link'
import { useState, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { signUp, signInWithGoogle, resendSignupConfirmationEmail } from '@/actions/auth'
import { isLikelyNextRedirectError } from '@/lib/navigation/nextRedirect'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Gift, Mail, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { AuthV2SecurityFooter, AuthV2Tabs, AuthGoogleOption } from '@/components/auth/v2/AuthV2FormChrome'

const inputClass =
  'h-11 min-h-11 !border !border-foreground/20 !bg-background !text-foreground !placeholder:text-foreground/55 shadow-inner !shadow-black/20 focus-visible:!border-[#fcba03]/50 focus-visible:!ring-2 focus-visible:!ring-[#fcba03]/30 dark:!bg-background dark:!text-foreground dark:!placeholder:text-foreground/55'

function SignupV2FormInner() {
  const [loading, setLoading] = useState<false | 'email'>(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)
  const [googleAttempts, setGoogleAttempts] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [passwordStarted, setPasswordStarted] = useState(false)
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null)
  const [resendBusy, setResendBusy] = useState(false)
  const submitLockRef = useRef(false)
  const searchParams = useSearchParams()
  const refCode = searchParams.get('ref') || ''
  const redirectTo = searchParams.get('redirectTo') || '/'
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmPasswordRef = useRef<HTMLInputElement>(null)

  async function handleGoogleSignUp() {
    if (googleBusy || googleAttempts >= 2) return
    setGoogleError(null)
    setGoogleBusy(true)
    try {
      const result = await signInWithGoogle({ referralCode: refCode || undefined, redirectTo })
      if (result && typeof result === 'object' && 'error' in result && result.error) {
        setGoogleError(result.error)
        setGoogleAttempts(a => a + 1)
      }
    } catch (e) {
      if (isLikelyNextRedirectError(e)) return
      setGoogleError("We couldn't start Google sign-up. Try again or continue with email below.")
      setGoogleAttempts(a => a + 1)
    } finally {
      setGoogleBusy(false)
    }
  }

  if (loading === 'email') {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center py-8 text-center">
        <div className="h-10 w-10 border-[3px] border-[#fcba03] border-t-transparent rounded-full animate-spin" />
        <p className="mt-5 text-sm text-foreground/60">Setting up your adventure, please hold on…</p>
        <p className="text-xs text-foreground/40 mt-3 max-w-sm leading-relaxed">
          We&apos;ll email you a confirmation link. After you verify, you can sign in and start exploring.
        </p>
      </div>
    )
  }

  if (pendingVerificationEmail) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#fcba03]/30 bg-[#fcba03]/10">
          <Mail className="h-7 w-7 text-primary" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-foreground">Verify your email</h2>
        <p className="text-sm text-foreground/60 mt-3 leading-relaxed text-left">
          We sent a confirmation link to{' '}
          <span className="text-foreground font-medium break-all">{pendingVerificationEmail}</span>. Open that email and tap{' '}
          <strong className="text-foreground">Confirm</strong> — then you&apos;ll land on sign-in, already signed in, ready
          to explore.
        </p>
        <p className="text-xs text-foreground/40 mt-3 text-left">
          Spam folder? Gmail &quot;Promotions&quot;? Check those too.
        </p>
        <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
          <Button
            type="button"
            variant="outline"
            className="border-foreground/20 text-foreground"
            disabled={resendBusy}
            onClick={async () => {
              setResendBusy(true)
              const r = await resendSignupConfirmationEmail(pendingVerificationEmail, redirectTo)
              setResendBusy(false)
              if ('error' in r && r.error) toast.error(r.error)
              else toast.success('Another email is on its way.')
            }}
          >
            {resendBusy ? 'Sending…' : 'Resend email'}
          </Button>
          <Button type="button" className="bg-[#fcba03] text-black font-bold" asChild>
            <Link href={`/login?redirectTo=${encodeURIComponent(redirectTo)}${refCode ? `&ref=${encodeURIComponent(refCode)}` : ''}`}>Go to sign in</Link>
          </Button>
        </div>
        <button
          type="button"
          className="mt-4 text-xs text-foreground/50 hover:text-foreground underline underline-offset-2"
          onClick={() => {
            setPendingVerificationEmail(null)
            submitLockRef.current = false
          }}
        >
          Use a different email
        </button>
        <AuthV2SecurityFooter />
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitLockRef.current) return
    submitLockRef.current = true
    setLoading('email')
    try {
      const formData = new FormData(e.currentTarget)
      if (!formData.has('confirmPassword')) {
        // Password managers can fill the password without an input event.
        setPasswordStarted(true)
        toast.error('Please confirm your password')
        setLoading(false)
        submitLockRef.current = false
        return
      }
      if (formData.get('password') !== formData.get('confirmPassword')) {
        toast.error('Passwords do not match')
        if (passwordRef.current) passwordRef.current.value = ''
        if (confirmPasswordRef.current) confirmPasswordRef.current.value = ''
        if (passwordRef.current) passwordRef.current.focus()
        setLoading(false)
        submitLockRef.current = false
        return
      }
      const result = await signUp(formData)
      if (result && 'needsEmailConfirmation' in result && result.needsEmailConfirmation) {
        setPendingVerificationEmail(result.email)
        setLoading(false)
        submitLockRef.current = false
        toast.success('Check your inbox for the verification link.')
        return
      }
      if (result && 'error' in result) {
        toast.error(result.error)
        const errorMsg = result.error.toLowerCase()
        if (errorMsg.includes('email')) {
          const emailEl = document.getElementById('auth-v2-signup-email') as HTMLInputElement | null
          if (emailEl) {
            emailEl.value = ''
            emailEl.focus()
          }
        } else if (errorMsg.includes('password')) {
          if (passwordRef.current) {
            passwordRef.current.value = ''
            passwordRef.current.focus()
          }
        }
        setLoading(false)
        submitLockRef.current = false
      }
    } catch {
      // redirect() on success
    }
  }

  return (
    <>
      <div className="mb-1 hidden sm:block">
        <h2 className="text-lg font-bold text-foreground md:text-xl">
          <span className="text-primary">Sign up</span> to continue
        </h2>
        <p className="mt-1 text-sm text-foreground/50">Join the community and start exploring.</p>
      </div>

      <AuthV2Tabs active="signup" />

      {refCode && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#fcba03]/30 bg-[#fcba03]/10 p-3">
          <Gift className="h-5 w-5 text-primary shrink-0" />
          <div className="text-left">
            <p className="text-sm font-bold text-primary">You&apos;ve been invited!</p>
            <p className="text-xs text-foreground/60">Get ₹200 off your first booking</p>
          </div>
        </div>
      )}

      <AuthGoogleOption busy={googleBusy} attempts={googleAttempts} error={googleError}
        onClick={() => void handleGoogleSignUp()} />

      <form onSubmit={handleSubmit} className="space-y-2.5">
        {refCode && <input type="hidden" name="referralCode" value={refCode} />}
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          <div>
            <label htmlFor="auth-v2-full-name" className="sr-only">Full name</label>
            <Input
              id="auth-v2-full-name"
              autoComplete="name"
              name="fullName"
              placeholder="Full name"
              required
              className={`${inputClass}`}
            />
          </div>
          <div>
            <label htmlFor="auth-v2-username" className="sr-only">Username</label>
            <Input
              id="auth-v2-username"
              autoComplete="username"
              name="username"
              placeholder="Username"
              required
              className={`${inputClass}`}
            />
          </div>
        </div>
        <div>
          <label htmlFor="auth-v2-signup-email" className="sr-only">Email</label>
          <Input
            id="auth-v2-signup-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="Email address"
            required
            className={`${inputClass}`}
          />
        </div>
        <div>
          <label htmlFor="auth-v2-signup-password" className="sr-only">Password</label>
          <div className="relative">
            <Input
              ref={passwordRef}
              id="auth-v2-signup-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Password (8+ characters)"
              onInput={e => { if (e.currentTarget.value) setPasswordStarted(true) }}
              minLength={8}
              required
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-foreground/45 hover:text-foreground"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {passwordStarted && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          <label htmlFor="auth-v2-confirm-password" className="sr-only">Confirm password</label>
          <div className="relative">
            <Input
              ref={confirmPasswordRef}
              id="auth-v2-confirm-password"
              name="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Confirm password"
              required
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-foreground/45 hover:text-foreground"
              onClick={() => setShowConfirmPassword(v => !v)}
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        )}
        <Button
          type="submit"
          disabled={!!loading || googleBusy}
          className="h-11 w-full bg-[#fcba03] text-base font-extrabold text-black shadow-lg shadow-[#fcba03]/20 hover:bg-[#fcba03]/90"
        >
          Create account
        </Button>
      </form>

      <p className="mt-2.5 text-center text-[11px] text-foreground/45 sm:mt-3">By creating an account, you agree to our terms and privacy policy.</p>

      <p className="mt-4 hidden text-center text-sm text-foreground/50 sm:block">
        Already have an account?{' '}
        <Link
          href={`/login${searchParams.toString() ? `?${searchParams.toString()}` : ''}`}
          className="font-semibold text-primary hover:underline"
        >
          Log in
        </Link>
      </p>

      <AuthV2SecurityFooter />
    </>
  )
}

export function SignupV2Form() {
  return (
    <Suspense fallback={<div className="min-h-[280px] animate-pulse rounded-lg bg-zinc-800/50" aria-hidden />}>
      <SignupV2FormInner />
    </Suspense>
  )
}
