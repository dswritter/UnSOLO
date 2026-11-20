'use client'

import { useState, useSyncExternalStore } from 'react'
import { Bell, Compass, Loader2, MapPin, Phone, ShieldCheck, Ticket, UsersRound, Wifi } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api/client'
import type { Preferences } from '@/lib/tribe/preferences'
import { INTERESTS } from '@/lib/tribe/preferences'
import { enableWebPush, webPushSupported } from '@/lib/push/client'
import { cn } from '@/lib/utils'

type Me = { gender: string | null; homeCity: string | null; phone: string | null; isPhoneVerified: boolean }

const CATEGORIES: { id: keyof Preferences['notify']['push']; label: string; hint: string }[] = [
  { id: 'plans', label: 'Plans', hint: 'Join requests, approvals, host offers' },
  { id: 'replies', label: 'Replies', hint: 'Comments and answers on your posts' },
  { id: 'messages', label: 'Messages', hint: 'Trip, plan and direct chats' },
  { id: 'trips', label: 'Trips', hint: 'Bookings, payments, departures' },
  { id: 'tags', label: 'Tags', hint: 'When someone wants to tag you in a story' },
  { id: 'marketing', label: 'Offers', hint: 'Occasional deals (off by default)' },
]

const noopSubscribe = () => () => {}

export function SettingsClient({ initial, me }: { initial: Preferences; me: Me }) {
  // Browser-only capability: false on the server and first paint, so hydration matches.
  const canWebPush = useSyncExternalStore(noopSubscribe, webPushSupported, () => false)
  const [p, setP] = useState(initial)
  const [gender, setGender] = useState(me.gender)
  const [homeCity, setHomeCity] = useState(me.homeCity ?? '')
  const [saving, setSaving] = useState(false)

  /** Optimistic: UI flips first, saves in the background, rolls back on error. */
  async function save(patch: Partial<Preferences>) {
    const prev = p
    const next = { ...p, ...patch, notify: { ...p.notify, ...(patch.notify ?? {}) } }
    setP(next)
    if (patch.landingTab) try { localStorage.setItem('unsolo.landingTab', patch.landingTab) } catch { /* ignore */ }
    try { await apiFetch('/me/preferences', { method: 'PUT', body: patch }) } catch (e) { setP(prev); toast.error((e as Error).message) }
  }
  async function saveProfile(patch: Record<string, unknown>) {
    setSaving(true)
    try { await apiFetch('/me', { method: 'PATCH', body: patch }); toast.success('Saved') } catch (e) { toast.error((e as Error).message) } finally { setSaving(false) }
  }
  function shareMyLocation() {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        void saveProfile({ homeLat: Math.round(pos.coords.latitude * 100) / 100, homeLng: Math.round(pos.coords.longitude * 100) / 100 })
        void save({ shareLocation: true })
      },
      () => toast.error('Location permission is off in your browser'),
      { enableHighAccuracy: false, timeout: 8000 },
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-28 pt-4 lg:pt-8">
      <h1 className="text-[28px]">Settings</h1>

      <Section title="Start page" icon={Compass} hint="Where UnSOLO opens when you launch the app.">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Start page">
          {([['explore', 'Explore', Compass], ['tribe', 'Tribe', UsersRound], ['trips', 'My trips', Ticket]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" role="radio" aria-checked={p.landingTab === id} onClick={() => save({ landingTab: id })}
              className={cn('flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border text-sm', p.landingTab === id ? 'border-foreground bg-foreground text-background font-semibold' : 'border-border hover:bg-accent')}>
              <Icon className="h-5 w-5" aria-hidden />{label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Notifications" icon={Bell} hint="Pushes respect quiet hours, except messages and trip updates.">
        {canWebPush && (
          <button type="button" className="pc-btn pc-btn-quiet pc-btn-sm mb-3" onClick={async () => {
            const r = await enableWebPush()
            if (r === 'enabled') toast.success('Notifications are on for this browser')
            else if (r === 'denied') toast.error('Notifications are blocked in your browser settings')
            else if (r === 'unconfigured') toast.message('Web push will work once the server keys are set up')
          }}>Turn on notifications in this browser</button>
        )}
        <ul className="divide-y divide-border border-y border-border">
          {CATEGORIES.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-3">
              <span><span className="block text-[15px] font-medium">{c.label}</span><span className="block text-xs text-muted-foreground">{c.hint}</span></span>
              <span className="flex gap-4 text-xs text-muted-foreground">
                <Toggle label="Push" on={p.notify.push[c.id]} onChange={(v) => save({ notify: { ...p.notify, push: { ...p.notify.push, [c.id]: v } } })} />
                <Toggle label="Email" on={p.notify.email[c.id]} onChange={(v) => save({ notify: { ...p.notify, email: { ...p.notify.email, [c.id]: v } } })} />
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-3 text-sm">
          <span>Quiet hours</span>
          <input type="time" className="pc-input w-32" value={p.notify.quietHours.from} onChange={(e) => save({ notify: { ...p.notify, quietHours: { ...p.notify.quietHours, from: e.target.value } } })} aria-label="Quiet from" />
          <span>to</span>
          <input type="time" className="pc-input w-32" value={p.notify.quietHours.to} onChange={(e) => save({ notify: { ...p.notify, quietHours: { ...p.notify.quietHours, to: e.target.value } } })} aria-label="Quiet until" />
        </div>
      </Section>

      <Section title="Suggestions" icon={MapPin} hint="We use an approximate location (about 1 km) — never your exact position.">
        <Row label="Suggest plans and trips near me" on={p.suggestByLocation} onChange={(v) => save({ suggestByLocation: v })} />
        <div className="mt-3 flex gap-2">
          <input className="pc-input" placeholder="Home city, e.g. Bengaluru" value={homeCity} onChange={(e) => setHomeCity(e.target.value)} maxLength={80} aria-label="Home city" />
          <button type="button" className="pc-btn pc-btn-quiet" disabled={saving} onClick={() => saveProfile({ homeCity: homeCity.trim() || null })}>Save</button>
        </div>
        <button type="button" className="pc-link mt-2 text-sm" onClick={shareMyLocation}>Use my current location instead</button>
        <p className="mt-4 text-sm font-medium">Interests</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {INTERESTS.map((i) => {
            const on = p.interests.includes(i)
            return <button key={i} type="button" className="pc-chip capitalize" aria-pressed={on} onClick={() => save({ interests: on ? p.interests.filter((x) => x !== i) : [...p.interests, i] })}>{i}</button>
          })}
        </div>
      </Section>

      <Section title="About you" icon={ShieldCheck} hint="Optional. Gender is used only for women-only plans and, if you allow it, to suggest them.">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Gender">
          {([['woman', 'Woman'], ['man', 'Man'], ['nonbinary', 'Non-binary'], ['prefer_not', 'Prefer not to say']] as const).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={gender === id} className="pc-chip"
              onClick={() => { setGender(id); void saveProfile({ gender: id }) }}>{label}</button>
          ))}
        </div>
        {gender === 'woman' && <Row className="mt-3" label="Show women-only plans first" on={p.suggestByGender} onChange={(v) => save({ suggestByGender: v })} />}
      </Section>

      <Section title="Data saver" icon={Wifi} hint="Loads small images only — useful on mobile data or in the mountains.">
        <Row label="Use less data" on={p.dataSaver} onChange={(v) => save({ dataSaver: v })} />
      </Section>

      <PhoneSection me={me} />
    </div>
  )
}

function PhoneSection({ me }: { me: Me }) {
  const [phone, setPhone] = useState(me.phone ?? '')
  const [code, setCode] = useState('')
  const [stage, setStage] = useState<'idle' | 'sent' | 'done'>(me.isPhoneVerified ? 'done' : 'idle')
  const [busy, setBusy] = useState(false)
  async function start() {
    setBusy(true)
    try {
      const r = await apiFetch<{ sent: boolean; devCode?: string }>('/me/phone/start', { body: { phone } })
      setStage('sent')
      toast.success(r.devCode ? `Code sent (dev: ${r.devCode})` : 'Code sent by SMS')
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  async function verify() {
    setBusy(true)
    try { await apiFetch('/me/phone/verify', { body: { phone, code } }); setStage('done'); toast.success('Phone verified') }
    catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Section id="phone" title="Phone verification" icon={Phone} hint="Needed to post, comment or join plans. Your number is never shown on Tribe.">
      {stage === 'done' ? <p className="text-sm font-medium text-[color:var(--pc-green)]">Verified{me.phone ? ` · ${me.phone.replace(/\d(?=\d{4})/g, '•')}` : ''}</p> : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input className="pc-input" inputMode="tel" autoComplete="tel" placeholder="10-digit mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Mobile number" />
            <button type="button" className="pc-btn" disabled={busy || phone.replace(/\D/g, '').length < 10} onClick={start}>{busy && stage === 'idle' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send code'}</button>
          </div>
          {stage === 'sent' && (
            <div className="flex gap-2">
              <input className="pc-input pc-mono tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Verification code" />
              <button type="button" className="pc-btn" disabled={busy || code.length !== 6} onClick={verify}>Verify</button>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

function Section({ id, title, hint, icon: Icon, children }: { id?: string; title: string; hint?: string; icon: typeof Bell; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-8 border-t border-foreground pt-4">
      <h2 className="flex items-center gap-2 text-xl"><Icon className="h-5 w-5" aria-hidden />{title}</h2>
      {hint && <p className="mb-3 mt-1 text-sm text-muted-foreground">{hint}</p>}
      {children}
    </section>
  )
}

function Row({ label, on, onChange, className }: { label: string; on: boolean; onChange: (v: boolean) => void; className?: string }) {
  return (
    <label className={cn('flex min-h-11 cursor-pointer items-center justify-between gap-3', className)}>
      <span className="text-[15px]">{label}</span>
      <Switch on={on} onChange={onChange} label={label} />
    </label>
  )
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return <span className="flex flex-col items-center gap-1">{label}<Switch on={on} onChange={onChange} label={label} /></span>
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={cn('relative h-7 w-12 shrink-0 rounded-full border transition-colors', on ? 'border-foreground bg-foreground' : 'border-[color:var(--pc-rule2)] bg-transparent')}>
      <span className={cn('absolute top-0.5 h-[22px] w-[22px] rounded-full transition-all', on ? 'left-[22px] bg-background' : 'left-0.5 bg-[color:var(--pc-rule2)]')} />
    </button>
  )
}
