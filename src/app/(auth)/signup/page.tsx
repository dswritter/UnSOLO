'use client'

import Link from 'next/link'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { signUp, signInWithGoogle } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mountain, Gift } from 'lucide-react'
import { toast } from 'sonner'

function SignupForm() {
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const refCode = searchParams.get('ref') || ''

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)

    if (formData.get('password') !== formData.get('confirmPassword')) {
      toast.error('Passwords do not match')
      setLoading(false)
      return
    }

    const result = await signUp(formData)
    if (result?.error) {
      toast.error(result.error)
      setLoading(false)
    }
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
          {/* Referral banner */}
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
            onClick={() => signInWithGoogle(refCode || undefined)}
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
            {/* Hidden referral code field */}
            {refCode && <input type="hidden" name="referralCode" value={refCode} />}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Full Name</label>
                <Input name="fullName" placeholder="Priya Sharma" required className="bg-secondary border-border" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Username</label>
                <Input name="username" placeholder="priyatravels" required className="bg-secondary border-border" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Email</label>
              <Input name="email" type="email" placeholder="you@example.com" required className="bg-secondary border-border" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Password</label>
              <Input name="password" type="password" placeholder="••••••••" minLength={8} required className="bg-secondary border-border" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Confirm Password</label>
              <Input name="confirmPassword" type="password" placeholder="••••••••" required className="bg-secondary border-border" />
            </div>
            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90"
              disabled={loading}
            >
              {loading ? 'Creating account...' : 'Create Account'}
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
