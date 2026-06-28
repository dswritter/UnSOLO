'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  sendPhoneOTP,
  verifyPhoneOTP,
  checkVerificationStatus,
  resendEmailVerification,
  submitForeignPhoneForReview,
  requestPhoneChange,
  cancelPhoneChangeRequest,
} from '@/actions/verification'
import { getPayoutDetails, type PayoutDetails } from '@/actions/payout'
import { PayoutDetailsForm } from '@/components/hosting/PayoutDetailsForm'
import { toast } from 'sonner'
import { CheckCircle, Circle, Phone, Mail, Shield, ArrowRight, Loader2, Wallet, RefreshCw, X, Clock, Compass } from 'lucide-react'
import { cn, PHONE_COUNTRY_CODES, type SupportedCountryCode } from '@/lib/utils'

function isLocalDevHostname(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1'
}

const COUNTRY_OPTIONS = Object.entries(PHONE_COUNTRY_CODES).map(([code, info]) => ({
  code: code as SupportedCountryCode,
  ...info,
}))

/** Country code chip with an invisible overlaid <select> — one click opens native dropdown */
function CountryCodeChip({
  value,
  onChange,
}: {
  value: SupportedCountryCode
  onChange: (code: SupportedCountryCode) => void
}) {
  const rule = PHONE_COUNTRY_CODES[value]
  return (
    <div className="relative inline-flex items-center shrink-0">
      <span className="flex items-center gap-1 px-3 py-[9px] bg-secondary rounded-lg text-sm font-medium border border-border select-none pointer-events-none whitespace-nowrap">
        {rule.flag} {value} <span className="text-muted-foreground text-[10px]">▾</span>
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SupportedCountryCode)}
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        aria-label="Country code"
      >
        {COUNTRY_OPTIONS.map((c) => (
          <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.name}</option>
        ))}
      </select>
    </div>
  )
}

export default function HostVerifyPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [emailVerified, setEmailVerified] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [existingPhone, setExistingPhone] = useState<string | null>(null)
  const [existingCountryCode, setExistingCountryCode] = useState('+91')
  const [pendingChangeRequest, setPendingChangeRequest] = useState<{
    id: string; newPhone: string; newCountryCode: string; requestedAt: string
  } | null>(null)

  // Phone flow
  const [countryCode, setCountryCode] = useState<SupportedCountryCode>('+91')
  const [step, setStep] = useState<'idle' | 'enter_phone' | 'enter_otp' | 'foreign_submitted'>('idle')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [sending, setSending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [payout, setPayout] = useState<PayoutDetails | null>(null)

  // Phone change request (for already-verified hosts)
  const [showChangeForm, setShowChangeForm] = useState(false)
  const [changePhone, setChangePhone] = useState('')
  const [changeCountryCode, setChangeCountryCode] = useState<SupportedCountryCode>('+91')
  const [changeNote, setChangeNote] = useState('')

  const payoutSaved = !!(payout && ((payout.upi_id && payout.upi_id.includes('@')) || (payout.bank_account_number && payout.bank_ifsc)))

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
        setExistingCountryCode(status.phoneCountryCode || '+91')
        setPendingChangeRequest(status.pendingChangeRequest)

        if (status.phoneNumber) setPhone(status.phoneNumber)
        if (status.phoneCountryCode) setCountryCode(status.phoneCountryCode as SupportedCountryCode)
        if (status.otpSendCooldownUntil) syncCooldownFromServer(status.otpSendCooldownUntil)

        if (status.isEmailVerified && !status.isPhoneVerified) {
          if (status.phoneNumber && status.phoneCountryCode && status.phoneCountryCode !== '+91') {
            setStep('foreign_submitted')
          } else {
            setStep('enter_phone')
          }
        }
      }
      const p = await getPayoutDetails()
      if (p && !('error' in p)) setPayout(p)
      else setPayout({ upi_id: null, bank_account_name: null, bank_account_number: null, bank_ifsc: null, payout_method: 'upi' })
      setLoading(false)
    }
    load()
  }, [syncCooldownFromServer])

  async function refreshPayout() {
    const p = await getPayoutDetails()
    if (p && !('error' in p)) setPayout(p)
  }

  // Web OTP autofill (Chrome/Android)
  useEffect(() => {
    if (step !== 'enter_otp' || typeof window === 'undefined') return
    type OtpCred = { code?: string }
    if (!('OTPCredential' in window)) return
    const ac = new AbortController()
    navigator.credentials
      .get({ otp: { transport: ['sms'] as const }, signal: ac.signal } as CredentialRequestOptions)
      .then((cred) => {
        const code = (cred as OtpCred)?.code
        if (code && /^\d{4,8}$/.test(code)) setOtp(code.replace(/\D/g, '').slice(0, 6))
      })
      .catch(() => {})
    return () => ac.abort()
  }, [step])

  async function handleSendOTP() {
    const rule = PHONE_COUNTRY_CODES[countryCode]
    if (phone.length !== rule.digits) { toast.error(`Enter ${rule.digits}-digit phone number`); return }
    setSending(true)
    const result = await sendPhoneOTP(phone)
    if (result.error) {
      toast.error(result.error)
      if ('cooldownUntil' in result && result.cooldownUntil) syncCooldownFromServer(result.cooldownUntil)
    } else if ('devConsoleOnly' in result && result.devConsoleOnly) {
      if (isLocalDevHostname()) {
        toast.success('OTP generated (local dev: check server terminal).')
        setOtp(''); setStep('enter_otp')
        if ('cooldownUntil' in result && result.cooldownUntil) syncCooldownFromServer(result.cooldownUntil)
      } else {
        toast.error('SMS sending failed. Please try again.')
        if ('cooldownUntil' in result && result.cooldownUntil) syncCooldownFromServer(result.cooldownUntil)
      }
    } else {
      toast.success(`OTP sent to ${countryCode} ${phone}`)
      setOtp(''); setStep('enter_otp')
      if ('cooldownUntil' in result && result.cooldownUntil) syncCooldownFromServer(result.cooldownUntil)
    }
    setSending(false)
  }

  async function handleForeignSubmit() {
    setSending(true)
    const result = await submitForeignPhoneForReview(phone, countryCode)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Number submitted. You\'ll be notified once our team verifies it.')
      setStep('foreign_submitted')
      setExistingPhone(phone)
      setExistingCountryCode(countryCode)
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
      setExistingPhone(phone)
      setStep('idle')
      if (result.isHost) { setIsHost(true); toast.success('You are now a verified host!') }
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

  async function handleRequestChange() {
    const rule = PHONE_COUNTRY_CODES[changeCountryCode]
    if (changePhone.replace(/\D/g, '').length !== rule.digits) {
      toast.error(`Enter a valid ${rule.digits}-digit ${rule.name} number`)
      return
    }
    setSending(true)
    const result = await requestPhoneChange(changePhone, changeCountryCode, changeNote)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Change request submitted. Our team will verify and update your number.')
      setShowChangeForm(false); setChangePhone(''); setChangeNote('')
      const status = await checkVerificationStatus()
      if (status) setPendingChangeRequest(status.pendingChangeRequest)
    }
    setSending(false)
  }

  async function handleCancelChangeRequest() {
    setSending(true)
    const result = await cancelPhoneChangeRequest()
    if (result.error) toast.error(result.error)
    else { toast.success('Change request cancelled.'); setPendingChangeRequest(null) }
    setSending(false)
  }

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const rule = PHONE_COUNTRY_CODES[countryCode]
  const isIndian = countryCode === '+91'

  // ── Verified host screen ─────────────────────────────────────────────────────
  if (isHost) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="text-center mb-8">
          <div className="h-20 w-20 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-6">
            <Shield className="h-10 w-10 text-emerald-700 dark:text-emerald-400" />
          </div>
          <h1 className="text-3xl font-black mb-2">You&apos;re a Verified Host!</h1>
          <p className="text-muted-foreground">
            {payoutSaved
              ? 'Phone and email verified. You can now create and host trips on UnSOLO.'
              : 'One last step — add where we should send your earnings.'}
          </p>
        </div>

        {payout && (
          <div className={`p-5 rounded-xl border mb-6 ${payoutSaved ? 'border-emerald-600/30 bg-emerald-500/8 dark:bg-emerald-500/10' : 'border-primary/50 bg-primary/[0.08] ring-2 ring-primary/35'}`}>
            <div className="flex items-center gap-3 mb-4">
              {payoutSaved ? <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400" /> : <Wallet className="h-6 w-6 text-primary" />}
              <div>
                <h3 className="font-bold">Payout Details</h3>
                <p className="text-xs text-muted-foreground">
                  {payoutSaved ? 'Saved — update anytime from the host dashboard.' : 'Required before you can publish listings.'}
                </p>
              </div>
            </div>
            <PayoutDetailsForm initial={payout} onSaved={refreshPayout} compact />
          </div>
        )}

        {/* Phone change section */}
        <div className="rounded-xl border border-border bg-card p-4 mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Verified phone</p>
              <p className="text-xs text-muted-foreground">
                {existingCountryCode} {existingPhone}
                {existingCountryCode !== '+91' && (
                  <span className="ml-1.5 text-amber-400">(manually verified)</span>
                )}
              </p>
            </div>
            {!pendingChangeRequest && (
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowChangeForm(!showChangeForm)}>
                <RefreshCw className="h-3 w-3 mr-1" /> Change number
              </Button>
            )}
          </div>

          {pendingChangeRequest && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-300">Phone change pending approval</p>
              <p className="text-xs text-muted-foreground">
                New number: <span className="text-foreground font-medium">{pendingChangeRequest.newCountryCode} {pendingChangeRequest.newPhone}</span>
                {' '}— our team will verify and update your profile.
              </p>
              <Button variant="outline" size="sm" className="text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={handleCancelChangeRequest} disabled={sending}>
                <X className="h-3 w-3 mr-1" /> Cancel request
              </Button>
            </div>
          )}

          {showChangeForm && !pendingChangeRequest && (
            <div className="space-y-3 pt-1">
              <p className="text-xs text-muted-foreground">Your current number stays visible until our team approves the change.</p>
              <div className="flex gap-2">
                <CountryCodeChip value={changeCountryCode} onChange={(c) => { setChangeCountryCode(c); setChangePhone('') }} />
                <Input
                  type="tel"
                  placeholder={`${PHONE_COUNTRY_CODES[changeCountryCode].digits}-digit number`}
                  value={changePhone}
                  onChange={(e) => setChangePhone(e.target.value.replace(/\D/g, '').slice(0, PHONE_COUNTRY_CODES[changeCountryCode].digits))}
                  maxLength={PHONE_COUNTRY_CODES[changeCountryCode].digits}
                  inputMode="numeric"
                  className="bg-secondary border-border"
                />
              </div>
              <Input type="text" placeholder="Note for staff (optional)" value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)} className="bg-secondary border-border text-sm" />
              <div className="flex gap-2">
                <Button onClick={handleRequestChange} disabled={sending} size="sm" className="bg-primary text-primary-foreground font-bold text-xs">
                  {sending ? 'Submitting…' : 'Submit change request'}
                </Button>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowChangeForm(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3 justify-center">
          <Button onClick={() => router.push('/host/create')} className="bg-primary text-primary-foreground font-bold" size="lg" disabled={!payoutSaved}>
            <ArrowRight className="mr-2 h-4 w-4" /> Create Your First Trip
          </Button>
          <Button onClick={() => router.push('/host')} variant="outline" size="lg">Host Dashboard</Button>
        </div>
      </div>
    )
  }

  // ── Foreign phone pending screen ─────────────────────────────────────────────
  // Phone submitted for manual review but not yet verified (and not a full host yet).
  // Show payout form now so they can fill it while waiting.
  if (step === 'foreign_submitted') {
    const foreignRule = PHONE_COUNTRY_CODES[existingCountryCode as SupportedCountryCode] || PHONE_COUNTRY_CODES['+977']
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="text-center mb-8">
          <div className="h-20 w-20 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto mb-6">
            <Clock className="h-10 w-10 text-amber-400" />
          </div>
          <h1 className="text-2xl font-black mb-2">Verification in Progress</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Our team will contact you on{' '}
            <span className="text-foreground font-medium">{existingCountryCode} {existingPhone}</span>{' '}
            to verify your identity.
          </p>
        </div>

        {/* Status steps */}
        <div className="rounded-xl border border-border bg-card p-4 mb-6 space-y-3 text-sm">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
            <span>Email verified</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 rounded-full border-2 border-amber-400 flex items-center justify-center shrink-0">
              <div className="h-2 w-2 rounded-full bg-amber-400" />
            </div>
            <span>
              {foreignRule.flag} Phone verification pending
              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                In review
              </span>
            </span>
          </div>
          <div className="flex items-center gap-3 opacity-40">
            <Circle className="h-5 w-5 shrink-0" />
            <span>Host access unlocked</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center mb-6">
          You&apos;ll receive a notification as soon as your number is verified. Until then, fill in your payout details below so you&apos;re ready to go.
        </p>

        {/* Payout form — available now so they don't have to wait */}
        {payout && (
          <div className={`p-5 rounded-xl border mb-6 ${payoutSaved ? 'border-emerald-600/30 bg-emerald-500/8 dark:bg-emerald-500/10' : 'border-primary/30 bg-primary/5'}`}>
            <div className="flex items-center gap-3 mb-4">
              {payoutSaved ? <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400" /> : <Wallet className="h-6 w-6 text-primary" />}
              <div>
                <h3 className="font-bold">Payout Details</h3>
                <p className="text-xs text-muted-foreground">
                  {payoutSaved ? 'Saved — you\'re all set for when verification completes.' : 'Add these now so your earnings are ready to go after verification.'}
                </p>
              </div>
            </div>
            <PayoutDetailsForm initial={payout} onSaved={refreshPayout} compact />
          </div>
        )}

        {payoutSaved && (
          <div className="rounded-xl border border-border bg-card/60 p-4 mb-6 text-center space-y-1">
            <p className="text-sm font-semibold">All set!</p>
            <p className="text-xs text-muted-foreground">Once our team verifies your phone, you&apos;ll be able to create trips and listings. We&apos;ll notify you the moment it&apos;s done.</p>
          </div>
        )}

        <div className="flex flex-wrap gap-3 justify-center">
          <Button onClick={() => router.push('/wander')} variant="outline" size="lg">
            <Compass className="mr-2 h-4 w-4" /> Browse Trips
          </Button>
          <button
            className="text-xs text-muted-foreground hover:text-foreground underline self-center"
            onClick={() => { setStep('enter_phone'); setPhone('') }}
          >
            Wrong number? Change it
          </button>
        </div>
      </div>
    )
  }

  // ── Main verify screen (not yet a host, phone not submitted) ─────────────────
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-black">Become a <span className="text-primary">Host</span></h1>
        <p className="text-muted-foreground mt-2">
          Verify your identity to create and host trips on UnSOLO. Both phone and email verification are required.
        </p>
      </div>

      <div className="space-y-6">
        {/* Email Verification */}
        <div className={`p-5 rounded-xl border ${emailVerified ? 'border-emerald-600/30 bg-emerald-500/8 dark:bg-emerald-500/10' : 'border-border bg-card'}`}>
          <div className="flex items-center gap-3 mb-3">
            {emailVerified
              ? <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              : <Circle className="h-6 w-6 text-muted-foreground flex-shrink-0" />}
            <div>
              <h3 className="font-bold flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> Email Verification</h3>
              <p className="text-xs text-muted-foreground">{emailVerified ? 'Email verified' : 'Check your inbox for the verification link'}</p>
            </div>
          </div>
          {!emailVerified && (
            <Button onClick={handleResendEmail} disabled={sending} variant="outline" size="sm" className="w-full">
              {sending ? 'Sending...' : 'Resend Verification Email'}
            </Button>
          )}
        </div>

        {/* Phone Verification */}
        <div className={cn(
          'p-5 rounded-xl border transition-all duration-300',
          phoneVerified && 'border-emerald-600/30 bg-emerald-500/8 dark:bg-emerald-500/10',
          !phoneVerified && emailVerified && 'border-primary/50 bg-primary/[0.08] ring-2 ring-primary/35 shadow-[0_0_32px_-8px_hsl(var(--primary)/0.35)]',
          !phoneVerified && !emailVerified && 'border-border bg-card opacity-90',
        )}>
          <div className="flex items-start gap-3 mb-3">
            {phoneVerified
              ? <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              : <Circle className="h-6 w-6 text-muted-foreground flex-shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold flex items-center gap-2"><Phone className="h-4 w-4 text-primary" /> Phone Verification</h3>
                {!phoneVerified && emailVerified && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                    Next step
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {phoneVerified
                  ? `Verified: ${existingCountryCode} ${existingPhone}`
                  : 'Verify your mobile number to start hosting trips.'}
              </p>
            </div>
          </div>

          {!phoneVerified && !emailVerified && (
            <p className="text-xs text-muted-foreground pl-9">Complete email verification above, then enter your mobile number here.</p>
          )}

          {!phoneVerified && emailVerified && step === 'enter_phone' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <CountryCodeChip
                  value={countryCode}
                  onChange={(c) => { setCountryCode(c); setPhone('') }}
                />
                <Input
                  type="tel"
                  placeholder={`${rule.digits}-digit number`}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, rule.digits))}
                  maxLength={rule.digits}
                  inputMode="numeric"
                  autoComplete="tel-national"
                  className="bg-secondary border-border"
                />
              </div>

              {!isIndian && (
                <p className="text-xs text-muted-foreground">
                  Enter your number and wait for the verification call or message from our team.
                </p>
              )}

              <Button
                onClick={isIndian ? handleSendOTP : handleForeignSubmit}
                disabled={sending || phone.length !== rule.digits || (isIndian && resendCooldown > 0)}
                className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90"
              >
                {sending
                  ? isIndian ? 'Sending OTP…' : 'Submitting…'
                  : isIndian
                  ? resendCooldown > 0 ? `Wait ${resendCooldown}s` : 'Send OTP'
                  : 'Submit for verification'}
              </Button>
            </div>
          )}

          {!phoneVerified && emailVerified && step === 'enter_otp' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">OTP sent to +91 {phone}. Enter the 6-digit code:</p>
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
                <Button onClick={handleVerifyOTP} disabled={sending || otp.length !== 6}
                  className="flex-1 bg-primary text-primary-foreground font-bold hover:bg-primary/90">
                  {sending ? 'Verifying...' : 'Verify OTP'}
                </Button>
                <Button onClick={() => { setStep('enter_phone'); setOtp(''); setResendCooldown(0) }}
                  variant="outline" size="sm" className="shrink-0">
                  Change number
                </Button>
              </div>
              <button
                type="button"
                onClick={handleSendOTP}
                disabled={sending || resendCooldown > 0 || phone.length !== 10}
                className={cn('text-xs w-full text-center',
                  resendCooldown > 0 || sending ? 'text-muted-foreground cursor-not-allowed' : 'text-primary hover:underline')}
              >
                {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
              </button>
            </div>
          )}
        </div>

        {/* Payout Details — shown after both verifications complete */}
        {emailVerified && phoneVerified && payout && (
          <div className={`p-5 rounded-xl border ${payoutSaved ? 'border-emerald-600/30 bg-emerald-500/8 dark:bg-emerald-500/10' : 'border-primary/30 bg-primary/5'}`}>
            <div className="flex items-center gap-3 mb-4">
              {payoutSaved
                ? <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                : <Wallet className="h-6 w-6 text-primary flex-shrink-0" />}
              <div>
                <h3 className="font-bold">Payout Details</h3>
                <p className="text-xs text-muted-foreground">
                  {payoutSaved ? 'Saved — you can update these anytime.' : 'Where should we send your host earnings?'}
                </p>
              </div>
            </div>
            <PayoutDetailsForm initial={payout} onSaved={refreshPayout} compact />
          </div>
        )}

        <div className="text-center text-sm text-muted-foreground pt-4">
          {emailVerified && phoneVerified && payoutSaved
            ? <p className="text-emerald-800 dark:text-emerald-300 font-medium">All set! You&apos;re ready to host.</p>
            : emailVerified && phoneVerified
            ? <p className="text-primary font-medium">Almost there! Add your payout details above.</p>
            : <p>Complete both verifications to start hosting trips.</p>}
        </div>
      </div>
    </div>
  )
}
