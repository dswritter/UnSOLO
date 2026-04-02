'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { signIn, signInWithGoogle } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mountain } from 'lucide-react'
import { toast } from 'sonner'

const TRAVEL_QUOTES = [
  "The world is a book, and those who do not travel read only one page.",
  "Adventure is worthwhile in itself.",
  "Not all those who wander are lost.",
  "Travel makes one modest. You see what a tiny place you occupy in the world.",
  "Life is either a daring adventure or nothing at all.",
  "The journey of a thousand miles begins with a single step.",
  "Travel far enough, you meet yourself.",
  "To travel is to live.",
  "Jobs fill your pocket, but adventures fill your soul.",
  "Traveling tends to magnify all human emotions.",
]

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [quoteIndex, setQuoteIndex] = useState(0)

  // Rotate quotes while loading — 6 seconds per quote
  useEffect(() => {
    if (!loading) return
    setQuoteIndex(Math.floor(Math.random() * TRAVEL_QUOTES.length))
    const interval = setInterval(() => {
      setQuoteIndex(prev => (prev + 1) % TRAVEL_QUOTES.length)
    }, 6000)
    return () => clearInterval(interval)
  }, [loading])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const result = await signIn(formData)
    if (result?.error) {
      toast.error(result.error)
      setLoading(false)
    }
  }

  // Full-screen loading overlay with travel quotes
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <span className="text-4xl font-black">
            <span className="text-primary">UN</span><span className="text-foreground">SOLO</span>
          </span>
          <div className="mt-8 mb-4">
            <div className="h-10 w-10 border-[3px] border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
          <p className="text-sm text-muted-foreground mb-6">Preparing your journey, please hold on...</p>
          {/* Quote with fade animation */}
          <div className="min-h-[60px] flex items-center justify-center">
            <p key={quoteIndex} className="text-primary italic text-sm font-medium animate-fade-in">
              &ldquo;{TRAVEL_QUOTES[quoteIndex]}&rdquo;
            </p>
          </div>
          {/* Progress bar that fills over 6 seconds per quote */}
          <div className="mt-6 mx-auto w-48 h-1 bg-secondary rounded-full overflow-hidden">
            <div
              key={quoteIndex}
              className="h-full bg-primary rounded-full"
              style={{ animation: 'progress-fill 6s linear forwards' }}
            />
          </div>
          <style>{`
            @keyframes progress-fill { from { width: 0%; } to { width: 100%; } }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
            .animate-fade-in { animation: fadeIn 0.5s ease-out; }
          `}</style>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/">
            <span className="text-4xl font-black">
              <span className="text-primary">UN</span><span className="text-foreground">SOLO</span>
            </span>
          </Link>
          <p className="text-muted-foreground text-sm mt-2">Change the way you travel.</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 space-y-6">
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
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-3 text-muted-foreground">or continue with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Email</label>
              <Input
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                className="bg-secondary border-border"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Password</label>
                <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input
                name="password"
                type="password"
                placeholder="••••••••"
                required
                className="bg-secondary border-border"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-primary text-black font-bold hover:bg-primary/90"
              disabled={loading}
            >
              Sign In
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-primary font-medium hover:underline">
              Sign up free
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
