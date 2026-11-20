'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { validateIndianPhone } from '@/lib/utils'

/** Only same-site relative paths (blocks open redirects such as //evil.com or https://…). */
function safeRedirect(path: string | null | undefined) {
  return path && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\') ? path : '/'
}

/**
 * Passwordless sign-in with a 6-digit code by email or SMS (Supabase Auth OTP). Same flow as the
 * Android/iOS apps. Phone sign-in needs a Supabase SMS provider (docs/revamp/setup-inputs.md §3);
 * email codes need the Supabase email template to include {{ .Token }}.
 */
export function OtpSignIn({ redirectTo }: { redirectTo: string | null }) {
  const router = useRouter()
  const [mode, setMode] = useState<'email' | 'phone'>('email')
  const [value, setValue] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  function target() {
    if (mode === 'email') return value.trim().toLowerCase()
    const p = validateIndianPhone(value)
    return p ? `+91${p}` : null
  }

  async function send() {
    const t = target()
    if (!t || (mode === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t))) {
      toast.error(mode === 'email' ? 'Enter a valid email' : 'Enter a valid 10-digit mobile number')
      return
    }
    setBusy(true)
    const supabase = createClient()
    const { error } = mode === 'email'
      ? await supabase.auth.signInWithOtp({ email: t, options: { shouldCreateUser: true } })
      : await supabase.auth.signInWithOtp({ phone: t })
    setBusy(false)
    if (error) {
      toast.error(mode === 'phone' && /provider|sms|phone/i.test(error.message) ? 'Phone sign-in isn’t switched on yet. Use email for now.' : error.message)
      return
    }
    setSent(true)
    toast.success(mode === 'email' ? 'Check your inbox for a 6-digit code' : 'We sent you a 6-digit code')
  }

  async function verify() {
    const t = target()
    if (!t || !/^\d{6}$/.test(code)) return
    setBusy(true)
    const supabase = createClient()
    const { error } = mode === 'email'
      ? await supabase.auth.verifyOtp({ email: t, token: code, type: 'email' })
      : await supabase.auth.verifyOtp({ phone: t, token: code, type: 'sms' })
    setBusy(false)
    if (error) { toast.error('That code didn’t work. Check it or ask for a new one.'); return }
    router.replace(safeRedirect(redirectTo))
    router.refresh()
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="mb-2 text-sm font-medium">Or sign in with a one-time code</p>
      <div className="mb-2 flex gap-2" role="radiogroup" aria-label="Code by">
        {(['email', 'phone'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className="pc-chip"
            onClick={() => { setMode(m); setSent(false); setValue(''); setCode('') }}>{m === 'email' ? 'Email' : 'Phone'}</button>
        ))}
      </div>
      {!sent ? (
        <div className="flex gap-2">
          <input className="pc-input" value={value} onChange={(e) => setValue(e.target.value)}
            type={mode === 'email' ? 'email' : 'tel'} inputMode={mode === 'email' ? 'email' : 'tel'}
            autoComplete={mode === 'email' ? 'email' : 'tel'} placeholder={mode === 'email' ? 'you@example.com' : '10-digit mobile number'}
            aria-label={mode === 'email' ? 'Email for code' : 'Mobile number for code'} />
          <button type="button" className="pc-btn shrink-0" disabled={busy || !value.trim()} onClick={send}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send code'}</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input className="pc-input pc-mono tracking-[0.3em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" aria-label="Code" />
          <button type="button" className="pc-btn shrink-0" disabled={busy || code.length !== 6} onClick={verify}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}</button>
        </div>
      )}
      {sent && <button type="button" className="pc-link mt-2 text-xs" onClick={() => { setSent(false); setCode('') }}>Use a different {mode}</button>}
    </div>
  )
}
