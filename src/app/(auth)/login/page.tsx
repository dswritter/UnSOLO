'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { signIn, signInWithGoogle } from '@/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Mountain, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

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
  const [authMode, setAuthMode] = useState<'email' | 'phone'>('email')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpLoading, setOtpLoading] = useState(false)

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
      setLoading(false)
    }
  }

  async function handleSendOtp() {
    const cleanPhone = phone.replace(/\s/g, '')
    if (!cleanPhone || cleanPhone.length < 10) {
      toast.error('Enter a valid phone number')
      return
    }
    setOtpLoading(true)
    const fullPhone = cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone}`
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({ phone: fullPhone })
    if (error) {
      toast.error(error.message)
    } else {
      setOtpSent(true)
      toast.success('OTP sent to your phone!')
    }
    setOtpLoading(false)
  }

  async function handleVerifyOtp() {
    const cleanPhone = phone.replace(/\s/g, '')
    const fullPhone = cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone}`
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({ phone: fullPhone, token: otp, type: 'sms' })
    if (error) {
      toast.error(error.message)
      setLoading(false)
    } else {
      window.location.href = '/explore'
    }
  }

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
          <div className="min-h-[60px] flex items-center justify-center">
            <p key={quoteIndex} className="text-primary italic text-sm font-medium" style={{ animation: 'fadeIn 0.5s ease-out' }}>
              &ldquo;{TRAVEL_QUOTES[quoteIndex]}&rdquo;
            </p>
          </div>
          <div className="mt-6 mx-auto w-48 h-1 bg-secondary rounded-full overflow-hidden">
            <div key={quoteIndex} className="h-full bg-primary rounded-full" style={{ animation: 'progress-fill 6s linear forwards' }} />
          </div>
          <style>{`
            @keyframes progress-fill { from { width: 0%; } to { width: 100%; } }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
          `}</style>
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

          {/* Auth mode tabs */}
          <div className="flex rounded-lg bg-secondary p-1">
            <button
              onClick={() => setAuthMode('email')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                authMode === 'email' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'
              }`}
            >
              Email
            </button>
            <button
              onClick={() => setAuthMode('phone')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                authMode === 'phone' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'
              }`}
            >
              <Phone className="inline h-3 w-3 mr-1" />Phone OTP
            </button>
          </div>

          {authMode === 'email' ? (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Email</label>
                <Input name="email" type="email" placeholder="you@example.com" required className="bg-secondary border-border" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Password</label>
                  <Link href="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
                </div>
                <Input name="password" type="password" placeholder="••••••••" required className="bg-secondary border-border" />
              </div>
              <Button type="submit" className="w-full bg-primary text-black font-bold hover:bg-primary/90">Sign In</Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Phone Number</label>
                <div className="flex gap-2">
                  <span className="flex items-center px-3 bg-secondary border border-border rounded-lg text-sm text-muted-foreground">+91</span>
                  <Input
                    type="tel"
                    placeholder="9876543210"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="bg-secondary border-border"
                  />
                </div>
              </div>

              {otpSent ? (
                <>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Enter OTP</label>
                    <Input
                      type="text"
                      placeholder="6-digit OTP"
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="bg-secondary border-border text-center text-lg tracking-widest"
                      maxLength={6}
                    />
                  </div>
                  <Button onClick={handleVerifyOtp} className="w-full bg-primary text-black font-bold hover:bg-primary/90">
                    Verify & Sign In
                  </Button>
                  <button onClick={() => { setOtpSent(false); setOtp('') }} className="text-xs text-muted-foreground hover:text-primary w-full text-center">
                    Resend OTP
                  </button>
                </>
              ) : (
                <Button onClick={handleSendOtp} disabled={otpLoading} className="w-full bg-primary text-black font-bold hover:bg-primary/90">
                  {otpLoading ? 'Sending OTP...' : 'Send OTP'}
                </Button>
              )}
            </div>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-primary font-medium hover:underline">Sign up free</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
