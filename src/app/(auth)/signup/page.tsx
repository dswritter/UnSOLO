'use client'

import Link from 'next/link'
import { useState } from 'react'
import { signUp, signInWithGoogle } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mountain } from 'lucide-react'
import { toast } from 'sonner'

export default function SignupPage() {
  const [loading, setLoading] = useState(false)

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
    <div className="min-h-screen bg-black flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/">
            <span className="text-4xl font-black">
              <span className="text-primary">UN</span><span className="text-white">SOLO</span>
            </span>
          </Link>
          <p className="text-muted-foreground text-sm mt-2">Change the way you travel.</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Create your account</h1>
            <p className="text-sm text-muted-foreground mt-1">Join India&apos;s solo travel community</p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full border-border"
            onClick={() => signInWithGoogle()}
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
              className="w-full bg-primary text-black font-bold hover:bg-primary/90"
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
