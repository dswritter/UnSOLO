'use client'

import Link from 'next/link'
import { useState, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { signUp, signInWithGoogle, resendSignupConfirmationEmail } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mountain, Gift, Mail, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { AuthLoadingCard } from '@/components/auth/AuthLoadingCard'

const inputPlaceholderClass =
  'placeholder:transition-opacity focus:placeholder:opacity-0 focus:placeholder:duration-150'

function SignupForm() {
  const [loading, setLoading] = useState<false | 'google' | 'email'>(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null)
  const [resendBusy, setResendBusy] = useState(false)
  const submitLockRef = useRef(false)
  const searchParams = useSearchParams()
  const refCode = searchParams.get('ref') || ''
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmPasswordRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitLockRef.current) return
    submitLockRef.current = true
    setLoading('email')
    try {
      const formData = new FormData(e.currentTarget)
      if (formData.get('password') !== formData.get('confirmPassword')) {
        toast.error('Passwords do not match')
        // Clear both password fields
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
        // Clear only problematic fields based on error message
        const errorMsg = result.error.toLowerCase()
        if (errorMsg.includes('email')) {
          if (emailRef.current) {
            emailRef.current.value = ''
            emailRef.current.focus()
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
      // Successful signUp calls redirect() which throws on client
    }
  }

  if (loading) {
    return (
      <AuthLoadingCard
        message={
          loading === 'email'
            ? 'Setting up your adventure, please hold on…'
            : 'Preparing your journey, please hold on…'
        }
        showEmailHint={loading === 'email'}
      />
    )
  }

  if (pendingVerificationEmail) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Link href="/">
              <span className="text-4xl font-black">
                <span className="text-primary">UN</span><span className="text-foreground">SOLO</span>
              </span>
            </Link>
          </div>
          <div className="bg-card border border-border rounded-2xl p-8 space-y-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 border border-primary/30">
              <Mail className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Verify your email</h1>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                We sent a confirmation link to{' '}
                <span className="text-foreground font-medium break-all">{pendingVerificationEmail}</span>. Open that email and tap{' '}
                <strong className="text-foreground">Confirm</strong> — then you&apos;ll land on sign-in,
                already signed in, ready to explore.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Spam folder? Gmail &quot;Promotions&quot;? Check those too. The link expires after a while; you can resend
              if needed.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button
                type="button"
                variant="outline"
                className="border-border"
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
              <Button type="button" className="bg-primary text-primary-foreground font-bold" asChild>
                <Link href="/login">Go to sign in</Link>
              </Button>
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              onClick={() => {
                setPendingVerificationEmail(null)
                submitLockRef.current = false
              }}
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    )
  }

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
          {refCode && (
            <div className="flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-xl p-3">
              <Gift className="h-5 w-5 text-primary flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-primary">You&apos;ve been invited!</p>
                <p className="text-xs text-muted-foreground">Get ₹200 off your first booking</p>
              </div>
            </div>
          )}

          <div>
            <h1 className="text-2xl font-bold">Create your account</h1>
            <p className="text-sm text-muted-foreground mt-1">Join India&apos;s solo travel community</p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full border-border"
            onClick={() => { setLoading('google'); signInWithGoogle(refCode || undefined) }}
          >
            <Mountain className="mr-2 h-4 w-4 text-primary" />
            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-3 text-muted-foreground">or sign up with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {refCode && <input type="hidden" name="referralCode" value={refCode} />}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Full Name</label>
                <Input
                  name="fullName"
                  placeholder="e.g. River Walker"
                  required
                  className={`bg-secondary border-border ${inputPlaceholderClass}`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Username</label>
                <Input
                  name="username"
                  placeholder="e.g. summit_seeker"
                  required
                  className={`bg-secondary border-border ${inputPlaceholderClass}`}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Email</label>
              <Input
                ref={emailRef}
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                className={`bg-secondary border-border ${inputPlaceholderClass}`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Password</label>
              <div className="relative">
                <Input
                  ref={passwordRef}
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  minLength={8}
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
            <div className="space-y-1">
              <label className="text-sm font-medium">Confirm Password</label>
              <div className="relative">
                <Input
                  ref={confirmPasswordRef}
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Repeat password"
                  required
                  className={`bg-secondary border-border pr-10 ${inputPlaceholderClass}`}
                />
                <button
                  type="button"
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90"
              disabled={!!loading}
            >
              Create Account
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center">
            By creating an account, you agree to our terms and privacy policy.
          </p>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-primary font-medium hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <SignupForm />
    </Suspense>
  )
}
