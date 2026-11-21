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
 * Passwordless sign-in with a 6-digit code. Email: Supabase Auth OTP (the email template must include
 * {{ .Token }}). Phone: our own SMS gateway (2factor.in / MSG91) through /api/v1/auth/phone/*, which
 * returns a Supabase session that we install with setSession. Same flow as the Android/iOS apps.
 */
async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json().catch(() => null)
    if (res.ok) return { ok: true, data: json as T }
    return { ok: false, error: (json?.error?.message as string) || 'Something went wrong. Try again.' }
  } catch {
    return { ok: false, error: 'You seem to be offline. Try again.' }
  }
}

export function OtpSignIn({ redirectTo }: { redirectTo: string | null }) {
  const router = useRouter()
  const [mode, setMode] = useState<'email' | 'phone'>('email')
  const [value, setValue] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [challenge, setChallenge] = useState<string | null>(null)

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
    if (mode === 'phone') {
      const r = await postJson<{ challenge: string; devCode?: string }>('/api/v1/auth/phone/start', { phone: t })
      setBusy(false)
      if (!r.ok) { toast.error(r.error); return }
      setChallenge(r.data.challenge)
      if (r.data.devCode) toast.message(`Dev code: ${r.data.devCode}`)
      setSent(true)
      toast.success('We sent you a 6-digit code')
      return
    }
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({ email: t, options: { shouldCreateUser: true } })
    setBusy(false)
    if (error) { toast.error(error.message); return }
    setSent(true)
    toast.success(mode === 'email' ? 'Check your inbox for a 6-digit code' : 'We sent you a 6-digit code')
  }

  async function verify() {
    const t = target()
    if (!t || !/^\d{6}$/.test(code)) return
    setBusy(true)
    const supabase = createClient()
    if (mode === 'phone') {
      if (!challenge) { setBusy(false); setSent(false); return }
      const r = await postJson<{ access_token: string; refresh_token: string }>('/api/v1/auth/phone/verify', { challenge, code })
      if (!r.ok) { setBusy(false); toast.error(r.error); return }
      const { error } = await supabase.auth.setSession({ access_token: r.data.access_token, refresh_token: r.data.refresh_token })
      setBusy(false)
      if (error) { toast.error('Couldn’t sign you in. Try again.'); return }
    } else {
      const { error } = await supabase.auth.verifyOtp({ email: t, token: code, type: 'email' })
      setBusy(false)
      if (error) { toast.error('That code didn’t work. Check it or ask for a new one.'); return }
    }
    router.replace(safeRedirect(redirectTo))
    router.refresh()
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="mb-2 text-sm font-medium">Or sign in with a one-time code</p>
      <div className="mb-2 flex gap-2" role="radiogroup" aria-label="Code by">
        {(['email', 'phone'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className="pc-chip"
            onClick={() => { setMode(m); setSent(false); setValue(''); setCode(''); setChallenge(null) }}>{m === 'email' ? 'Email' : 'Phone'}</button>
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
      {sent && <button type="button" className="pc-link mt-2 text-xs" onClick={() => { setSent(false); setCode(''); setChallenge(null) }}>Use a different {mode}</button>}
    </div>
  )
}
