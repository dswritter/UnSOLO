'use client'

import { useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api/client'
import { useWebOtp } from '@/hooks/useWebOtp'
import { SMS_OTP_LENGTH } from '@/lib/constants'

/** Number → SMS code → verified. Used by Settings and by the inline phone card. */
export function PhoneVerifyForm({ initialPhone = '', verified = false, onVerified, autoFocus }: {
  initialPhone?: string
  verified?: boolean
  onVerified?: () => void
  autoFocus?: boolean
}) {
  const [phone, setPhone] = useState(initialPhone)
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<'idle' | 'sent' | 'done'>(verified ? 'done' : 'idle')
  const [busy, setBusy] = useState(false)
  useWebOtp(stage === 'sent', (c) => { setCode(c); void verify(c) }, SMS_OTP_LENGTH)

  async function start() {
    setBusy(true)
    try {
      const r = await apiFetch<{ sent: boolean; devCode?: string }>('/me/phone/start', { body: { phone }, noPhoneGate: true })
      setStage('sent')
      toast.success(r.devCode ? `Code sent (dev: ${r.devCode})` : 'Code sent by SMS')
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  async function verify(c = code) {
    if (c.length !== SMS_OTP_LENGTH || busy) return
    setBusy(true)
    try {
      await apiFetch('/me/phone/verify', { body: { phone, code: c }, noPhoneGate: true })
      setStage('done')
      toast.success('Phone verified')
      onVerified?.()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  if (stage === 'done') {
    return (
      <p className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--pc-pine-soft)] px-3 py-2 text-sm font-semibold text-[color:var(--pc-accent-ink)]">
        <ShieldCheck className="h-4 w-4" aria-hidden />Verified{phone ? ` · ${phone.replace(/\d(?=\d{4})/g, '•')}` : ''}
      </p>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className="pc-input" inputMode="tel" autoComplete="tel" placeholder="10-digit mobile number" value={phone} autoFocus={autoFocus} data-autofocus={autoFocus ? '' : undefined}
          onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void start() } }} aria-label="Mobile number" />
        <button type="button" className="pc-btn shrink-0" disabled={busy || phone.replace(/\D/g, '').length < 10} onClick={start}>
          {busy && stage === 'idle' ? <Loader2 className="h-4 w-4 animate-spin" /> : stage === 'sent' ? 'Resend' : 'Send code'}
        </button>
      </div>
      {stage === 'sent' && (
        <div className="flex gap-2">
          <input className="pc-input tabular-nums tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={SMS_OTP_LENGTH} autoFocus
            placeholder={`${SMS_OTP_LENGTH}-digit code`} value={code} aria-label="Verification code"
            onChange={(e) => { const c = e.target.value.replace(/\D/g, '').slice(0, SMS_OTP_LENGTH); setCode(c); if (c.length === SMS_OTP_LENGTH) void verify(c) }} />
          <button type="button" className="pc-btn shrink-0" disabled={busy || code.length !== SMS_OTP_LENGTH} onClick={() => void verify()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
          </button>
        </div>
      )}
    </div>
  )
}
