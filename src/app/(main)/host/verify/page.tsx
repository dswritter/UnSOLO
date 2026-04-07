'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { sendPhoneOTP, verifyPhoneOTP, checkVerificationStatus, resendEmailVerification } from '@/actions/verification'
import { toast } from 'sonner'
import { CheckCircle, Circle, Phone, Mail, Shield, ArrowRight, Loader2 } from 'lucide-react'

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
  const [upiId, setUpiId] = useState('')
  const [upiSaved, setUpiSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const status = await checkVerificationStatus()
      if (status) {
        setPhoneVerified(status.isPhoneVerified)
        setEmailVerified(status.isEmailVerified)
        setIsHost(status.isHost)
        setExistingPhone(status.phoneNumber)
        if (status.phoneNumber) setPhone(status.phoneNumber)
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleSendOTP() {
    if (phone.length !== 10) { toast.error('Enter 10-digit phone number'); return }
    setSending(true)
    const result = await sendPhoneOTP(phone)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('OTP sent to +91 ' + phone)
      if ('devConsoleOnly' in result && result.devConsoleOnly) {
        toast.message('Development mode', { description: 'SMS provider not configured — check the server console/logs for the OTP code.' })
      }
      setStep('enter_otp')
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
          <div className={`p-5 rounded-xl border ${phoneVerified ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-card'}`}>
            <div className="flex items-center gap-3 mb-3">
              {phoneVerified ? (
                <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0" />
              ) : (
                <Circle className="h-6 w-6 text-muted-foreground flex-shrink-0" />
              )}
              <div>
                <h3 className="font-bold flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary" /> Phone Verification
                </h3>
                <p className="text-xs text-muted-foreground">
                  {phoneVerified ? `Verified: +91 ${existingPhone || phone}` : 'Verify your Indian mobile number via OTP'}
                </p>
              </div>
            </div>

            {!phoneVerified && step === 'idle' && (
              <Button onClick={() => setStep('enter_phone')} variant="outline" size="sm" className="w-full">
                Verify Phone Number
              </Button>
            )}

            {!phoneVerified && step === 'enter_phone' && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <span className="flex items-center px-3 bg-secondary rounded-lg text-sm font-medium">+91</span>
                  <Input
                    type="tel"
                    placeholder="9876543210"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    maxLength={10}
                    inputMode="numeric"
                    className="bg-secondary border-border"
                  />
                </div>
                <Button onClick={handleSendOTP} disabled={sending || phone.length !== 10} className="w-full bg-primary text-primary-foreground font-bold">
                  {sending ? 'Sending OTP...' : 'Send OTP'}
                </Button>
              </div>
            )}

            {!phoneVerified && step === 'enter_otp' && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">OTP sent to +91 {phone}. Enter the 6-digit code:</p>
                <Input
                  type="text"
                  placeholder="Enter 6-digit OTP"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  inputMode="numeric"
                  className="bg-secondary border-border text-center text-lg tracking-widest font-mono"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button onClick={handleVerifyOTP} disabled={sending || otp.length !== 6} className="flex-1 bg-primary text-primary-foreground font-bold">
                    {sending ? 'Verifying...' : 'Verify OTP'}
                  </Button>
                  <Button onClick={() => { setStep('enter_phone'); setOtp('') }} variant="outline" size="sm">
                    Change Number
                  </Button>
                </div>
                <button onClick={handleSendOTP} disabled={sending} className="text-xs text-primary hover:underline w-full text-center">
                  Resend OTP
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
