'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { sendPhoneOTP, verifyPhoneOTP, checkVerificationStatus, resendEmailVerification } from '@/actions/verification'
import { toast } from 'sonner'
import { CheckCircle, Circle, Phone, Mail, Shield, ArrowRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

function isLocalDevHostname(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1'
}

export default function HostVerifyPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [emailVerified, setEmailVerified] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [existingPhone, setExistingPhone] = useState<string | null>(null)

  // Phone OTP flow
  const [step, setStep] = useState<'idle' | 'enter_phone' | 'enter_otp'>('idle')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [sending, setSending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [upiId, setUpiId] = useState('')
  const [upiSaved, setUpiSaved] = useState(false)

  const syncCooldownFromServer = useCallback((iso: string | undefined | null) => {
    if (!iso) return
    const sec = Math.ceil((new Date(iso).getTime() - Date.now()) / 1000)
    setResendCooldown(sec > 0 ? sec : 0)
  }, [])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = window.setInterval(() => {
      setResendCooldown((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [resendCooldown])

  useEffect(() => {
    async function load() {
      const status = await checkVerificationStatus()
      if (status) {
        setPhoneVerified(status.isPhoneVerified)
        setEmailVerified(status.isEmailVerified)
        setIsHost(status.isHost)
        setExistingPhone(status.phoneNumber)
        if (status.phoneNumber) setPhone(status.phoneNumber)
        if (status.otpSendCooldownUntil) {
          const sec = Math.ceil((new Date(status.otpSendCooldownUntil).getTime() - Date.now()) / 1000)
          if (sec > 0) setResendCooldown(sec)
        }
        if (status.isEmailVerified && !status.isPhoneVerified) {
          setStep('enter_phone')
        }
      }
      setLoading(false)
    }
    load()
  }, [])

  // Web OTP (Chrome/Android): SMS must include app origin (configure your 2factor template accordingly).
  useEffect(() => {
    if (step !== 'enter_otp' || typeof window === 'undefined') return
    type OtpCred = { code?: string }
    if (!('OTPCredential' in window)) return
    const ac = new AbortController()
    const opts = {
      otp: { transport: ['sms'] as const },
      signal: ac.signal,
    } as CredentialRequestOptions
    navigator.credentials
      .get(opts)
      .then((cred) => {
        const code = (cred as OtpCred)?.code
        if (code && /^\d{4,8}$/.test(code)) setOtp(code.replace(/\D/g, '').slice(0, 6))
      })
      .catch(() => {})
    return () => ac.abort()
  }, [step])

  async function handleSendOTP() {
    if (phone.length !== 10) {
      toast.error('Enter 10-digit phone number')
      return
    }
    setSending(true)
    const result = await sendPhoneOTP(phone)
    if (result.error) {
      toast.error(result.error)
      if ('cooldownUntil' in result && result.cooldownUntil) {
        syncCooldownFromServer(result.cooldownUntil)
      }
    } else if ('devConsoleOnly' in result && result.devConsoleOnly) {
      if (isLocalDevHostname()) {
        toast.success('OTP generated (local dev: check your server terminal for the code).')
        setOtp('')
        setStep('enter_otp')
        if ('cooldownUntil' in result && result.cooldownUntil) {
          syncCooldownFromServer(result.cooldownUntil)
        }
      } else {
        toast.error('SMS sending failed. Please try again.')
        if ('cooldownUntil' in result && result.cooldownUntil) {
          syncCooldownFromServer(result.cooldownUntil)
        }
      }
    } else {
      toast.success('OTP sent to +91 ' + phone)
      setOtp('')
      setStep('enter_otp')
      if ('cooldownUntil' in result && result.cooldownUntil) {
        syncCooldownFromServer(result.cooldownUntil)
      }
    }
    setSending(false)
  }

  async function handleVerifyOTP() {
    if (otp.length !== 6) { toast.error('Enter 6-digit OTP'); return }
    setSending(true)
    const result = await verifyPhoneOTP(phone, otp)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Phone verified!')
      setPhoneVerified(true)
      setStep('idle')
      if (result.isHost) {
        setIsHost(true)
        toast.success('You are now a verified host!')
      }
    }
    setSending(false)
  }

  async function handleResendEmail() {
    setSending(true)
    const result = await resendEmailVerification()
    if (result.error) toast.error(result.error)
    else toast.success('Verification email sent! Check your inbox.')
    setSending(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (isHost) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <div className="h-20 w-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <Shield className="h-10 w-10 text-green-500" />
          </div>
          <h1 className="text-3xl font-black mb-2">You&apos;re a Verified Host!</h1>
          <p className="text-muted-foreground mb-8">Phone and email verified. You can now create and host trips on UnSOLO.</p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => router.push('/host/create')} className="bg-primary text-primary-foreground font-bold" size="lg">
              <ArrowRight className="mr-2 h-4 w-4" /> Create Your First Trip
            </Button>
            <Button onClick={() => router.push('/host')} variant="outline" size="lg">
              Host Dashboard
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black">Become a <span className="text-primary">Host</span></h1>
          <p className="text-muted-foreground mt-2">
            Verify your identity to create and host trips on UnSOLO. Both phone and email verification are required.
          </p>
        </div>

        <div className="space-y-6">
          {/* Email Verification */}
          <div className={`p-5 rounded-xl border ${emailVerified ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-card'}`}>
            <div className="flex items-center gap-3 mb-3">
              {emailVerified ? (
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0" />
              ) : (
                <Circle className="h-6 w-6 text-muted-foreground flex-shrink-0" />
              )}
              <div>
                <h3 className="font-bold flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" /> Email Verification
                </h3>
                <p className="text-xs text-muted-foreground">
                  {emailVerified ? 'Email verified' : 'Check your inbox for the verification link'}
                </p>
              </div>
            </div>
            {!emailVerified && (
              <Button onClick={handleResendEmail} disabled={sending} variant="outline" size="sm" className="w-full">
                {sending ? 'Sending...' : 'Resend Verification Email'}
              </Button>
            )}
          </div>

          {/* Phone Verification */}
          <div
            className={cn(
              'p-5 rounded-xl border transition-all duration-300',
              phoneVerified && 'border-green-500/30 bg-green-500/5',
              !phoneVerified &&
                emailVerified &&
                'border-primary/50 bg-primary/[0.08] ring-2 ring-primary/35 shadow-[0_0_32px_-8px_hsl(var(--primary)/0.35)]',
              !phoneVerified && !emailVerified && 'border-border bg-card opacity-90',
            )}
          >
            <div className="flex items-start gap-3 mb-3">
              {phoneVerified ? (
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0 mt-0.5" />
              ) : (
                <Circle className="h-6 w-6 text-muted-foreground flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold flex items-center gap-2">
                    <Phone className="h-4 w-4 text-primary" /> Phone Verification
                  </h3>
                  {!phoneVerified && emailVerified && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                      Next step
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {phoneVerified
                    ? `Verified: +91 ${existingPhone || phone}`
                    : 'Verify your Indian mobile number via OTP — required to host trips.'}
                </p>
              </div>
            </div>

            {!phoneVerified && !emailVerified && (
              <p className="text-xs text-muted-foreground pl-9">
                Complete email verification above, then enter your mobile number here.
              </p>
            )}

            {!phoneVerified && emailVerified && step === 'enter_phone' && (
              <div className="space-y-3 pl-0 sm:pl-0">
                <div className="flex gap-2">
                  <span className="flex items-center px-3 bg-secondary rounded-lg text-sm font-medium shrink-0">+91</span>
                  <Input
                    type="tel"
                    placeholder="9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    maxLength={10}
                    inputMode="numeric"
                    autoComplete="tel-national"
                    className="bg-secondary border-border"
                  />
                </div>
                <Button
                  onClick={handleSendOTP}
                  disabled={sending || phone.length !== 10 || resendCooldown > 0}
                  className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90"
                >
                  {sending ? 'Sending OTP...' : resendCooldown > 0 ? `Wait ${resendCooldown}s to resend` : 'Send OTP'}
                </Button>
              </div>
            )}

            {!phoneVerified && emailVerified && step === 'enter_otp' && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  OTP sent to +91 {phone}. Enter the 6-digit code (supported browsers can fill it automatically from SMS):
                </p>
                <Input
                  type="text"
                  name="one-time-code"
                  placeholder="6-digit OTP"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="bg-secondary border-border text-center text-lg tracking-widest font-mono"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleVerifyOTP}
                    disabled={sending || otp.length !== 6}
                    className="flex-1 bg-primary text-primary-foreground font-bold hover:bg-primary/90"
                  >
                    {sending ? 'Verifying...' : 'Verify OTP'}
                  </Button>
                  <Button
                    onClick={() => {
                      setStep('enter_phone')
                      setOtp('')
                      setResendCooldown(0)
                    }}
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                  >
                    Change number
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={handleSendOTP}
                  disabled={sending || resendCooldown > 0 || phone.length !== 10}
                  className={cn(
                    'text-xs w-full text-center',
                    resendCooldown > 0 || sending
                      ? 'text-muted-foreground cursor-not-allowed'
                      : 'text-primary hover:underline',
                  )}
                >
                  {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
                </button>
              </div>
            )}
          </div>

          {/* Payout Details — shown after both verifications */}
          {emailVerified && phoneVerified && (
            <div className={`p-5 rounded-xl border ${upiSaved ? 'border-green-500/30 bg-green-500/5' : 'border-primary/30 bg-primary/5'}`}>
              <div className="flex items-center gap-3 mb-3">
                {upiSaved ? (
                  <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0" />
                ) : (
                  <Circle className="h-6 w-6 text-primary flex-shrink-0" />
                )}
                <div>
                  <h3 className="font-bold">Payout Details</h3>
                  <p className="text-xs text-muted-foreground">Where should we send your host earnings?</p>
                </div>
              </div>
              <div className="space-y-3 pl-9">
                <Input
                  placeholder="Your UPI ID (e.g. name@upi, name@paytm)"
                  value={upiId}
                  onChange={e => setUpiId(e.target.value.toLowerCase().trim())}
                  className="bg-secondary border-border"
                  disabled={upiSaved}
                />
                {!upiSaved && (
                  <Button
                    onClick={async () => {
                      if (!upiId || !upiId.includes('@')) {
                        toast.error('Enter a valid UPI ID (must contain @)')
                        return
                      }
                      setSending(true)
                      const { createClient } = await import('@/lib/supabase/client')
                      const supabase = createClient()
                      const { error } = await supabase.from('profiles').update({ upi_id: upiId, payout_method: 'upi' }).eq('id', (await supabase.auth.getUser()).data.user?.id || '')
                      if (error) toast.error('Failed to save UPI ID')
                      else { toast.success('UPI ID saved!'); setUpiSaved(true) }
                      setSending(false)
                    }}
                    disabled={sending || !upiId.includes('@')}
                    className="bg-primary text-primary-foreground font-bold w-full"
                  >
                    Save UPI ID
                  </Button>
                )}
                {upiSaved && (
                  <button onClick={() => setUpiSaved(false)} className="text-xs text-primary hover:underline">
                    Change UPI ID
                  </button>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Your earnings (trip price minus 15% platform fee) will be transferred to this UPI ID after each successful booking.
                </p>
              </div>
            </div>
          )}

          {/* Status summary */}
          <div className="text-center text-sm text-muted-foreground pt-4">
            {emailVerified && phoneVerified && upiSaved ? (
              <p className="text-green-400 font-medium">All set! You&apos;re ready to host.</p>
            ) : emailVerified && phoneVerified ? (
              <p className="text-primary font-medium">Almost there! Add your payout details above.</p>
            ) : (
              <p>Complete both verifications to start hosting trips.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
