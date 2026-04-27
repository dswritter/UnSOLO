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
import { AuthV2SecurityFooter, AuthV2Tabs, GoogleMark } from '@/components/auth/v2/AuthV2FormChrome'

const inputClass =
  'h-11 min-h-11 !border !border-white/20 !bg-zinc-950 !text-white !placeholder:text-white/40 shadow-inner !shadow-black/20 focus-visible:!border-[#fcba03]/50 focus-visible:!ring-2 focus-visible:!ring-[#fcba03]/30 dark:!bg-zinc-950 dark:!text-white dark:!placeholder:text-white/40'
const inputPlaceholderClass =
  'placeholder:transition-opacity focus:placeholder:opacity-0 focus:placeholder:duration-150'

function SignupV2FormInner() {
  const [loading, setLoading] = useState<false | 'email'>(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)
  const [googleAttempts, setGoogleAttempts] = useState(0)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null)
  const [resendBusy, setResendBusy] = useState(false)
  const submitLockRef = useRef(false)
  const searchParams = useSearchParams()
  const refCode = searchParams.get('ref') || ''
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmPasswordRef = useRef<HTMLInputElement>(null)

  async function handleGoogleSignUp() {
    if (googleBusy || googleAttempts >= 2) return
    setGoogleError(null)
    setGoogleBusy(true)
    try {
      const result = await signInWithGoogle(refCode || undefined)
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
        <p className="mt-5 text-sm text-white/60">Setting up your adventure, please hold on…</p>
        <p className="text-xs text-white/40 mt-3 max-w-sm leading-relaxed">
          We&apos;ll email you a confirmation link. After you verify, you can sign in and start exploring.
        </p>
      </div>
    )
  }

  if (pendingVerificationEmail) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#fcba03]/30 bg-[#fcba03]/10">
          <Mail className="h-7 w-7 text-[#fcba03]" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-white">Verify your email</h2>
        <p className="text-sm text-white/60 mt-3 leading-relaxed text-left">
          We sent a confirmation link to{' '}
          <span className="text-white font-medium break-all">{pendingVerificationEmail}</span>. Open that email and tap{' '}
          <strong className="text-white">Confirm</strong> — then you&apos;ll land on sign-in, already signed in, ready
          to explore.
        </p>
        <p className="text-xs text-white/40 mt-3 text-left">
          Spam folder? Gmail &quot;Promotions&quot;? Check those too.
        </p>
        <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
          <Button
            type="button"
            variant="outline"
            className="border-white/20 text-white"
            disabled={resendBusy}
            onClick={async () => {
              setResendBusy(true)
              const r = await resendSignupConfirmationEmail(pendingVerificationEmail)
              setResendBusy(false)
              if ('error' in r && r.error) toast.error(r.error)
              else toast.success('Another email is on its way.')
            }}
          >
            {resendBusy ? 'Sending…' : 'Resend email'}
          </Button>
          <Button type="button" className="bg-[#fcba03] text-black font-bold" asChild>
            <Link href="/login">Go to sign in</Link>
          </Button>
        </div>
        <button
          type="button"
          className="mt-4 text-xs text-white/50 hover:text-white underline underline-offset-2"
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
      <div className="mb-1">
        <h2 className="text-lg font-bold text-white md:text-xl">
          <span className="text-[#fcba03]">Sign up</span> to continue
        </h2>
        <p className="mt-1 text-sm text-white/50">Join the community and start exploring.</p>
      </div>

      <AuthV2Tabs active="signup" />

      {refCode && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#fcba03]/30 bg-[#fcba03]/10 p-3">
          <Gift className="h-5 w-5 text-[#fcba03] shrink-0" />
          <div className="text-left">
            <p className="text-sm font-bold text-[#fcba03]">You&apos;ve been invited!</p>
            <p className="text-xs text-white/60">Get ₹200 off your first booking</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        {refCode && <input type="hidden" name="referralCode" value={refCode} />}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/80">Full name</label>
            <Input
              name="fullName"
              placeholder="e.g. River Walker"
              required
              className={`${inputClass} ${inputPlaceholderClass}`}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/80">Username</label>
            <Input
              name="username"
              placeholder="e.g. summit_seeker"
              required
              className={`${inputClass} ${inputPlaceholderClass}`}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-white/80">Email</label>
          <Input
            id="auth-v2-signup-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="hello@unsolo.in"
            required
            className={`${inputClass} ${inputPlaceholderClass}`}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-white/80">Password</label>
          <div className="relative">
            <Input
              ref={passwordRef}
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              minLength={8}
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
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-white/80">Confirm password</label>
          <div className="relative">
            <Input
              ref={confirmPasswordRef}
              name="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              className={`${inputClass} pr-10 ${inputPlaceholderClass}`}
            />
            <button
              type="button"
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-white/45 hover:text-white"
              onClick={() => setShowConfirmPassword(v => !v)}
              aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Button
          type="submit"
          disabled={!!loading || googleBusy}
          className="h-11 w-full bg-[#fcba03] text-base font-extrabold text-black shadow-lg shadow-[#fcba03]/20 hover:bg-[#fcba03]/90"
        >
          Create account
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
        disabled={!!loading || googleBusy || googleAttempts >= 2}
        className="h-11 w-full border-white/20 bg-transparent text-white hover:bg-white/5"
        onClick={() => void handleGoogleSignUp()}
      >
        <GoogleMark className="mr-2 h-4 w-4" />
        {googleBusy ? '…' : 'Continue with Google'}
      </Button>

      {googleError ? (
        <div className="mt-3 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2.5 text-left text-xs text-red-200/95 space-y-2">
          <p>{googleError}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {googleAttempts < 2 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 border-white/25 bg-transparent text-white hover:bg-white/10"
                disabled={googleBusy}
                onClick={() => void handleGoogleSignUp()}
              >
                Try Google again
              </Button>
            ) : (
              <p className="text-[11px] text-white/55">Continue with email above to create your account.</p>
            )}
            <button
              type="button"
              className="text-left text-[11px] font-semibold text-[#fcba03] hover:underline sm:text-right"
              onClick={() => {
                const el = document.getElementById('auth-v2-signup-email')
                el?.focus()
                el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
              }}
            >
              Use email sign-up instead
            </button>
          </div>
        </div>
      ) : null}

      <p className="text-[11px] text-white/40 text-center mt-3">By creating an account, you agree to our terms and privacy policy.</p>

      <p className="mt-4 text-center text-sm text-white/50">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-[#fcba03] hover:underline">
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
