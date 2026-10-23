'use client'

import { useId, useState } from 'react'
import { UserRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { PHONE_COUNTRY_CODES } from '@/lib/utils'
import type { HostListingContactInput, HostListingAssignment } from '@/lib/host-listing-contact'
import { updateHostListingContact } from '@/actions/host-listing-assignments'
import { HostListingContactPicker } from './HostListingContactPicker'

type Selected = { label: string; detail: string; registered: boolean }

/**
 * Progressive host step: search first, then either a compact card for an existing
 * host or the email/phone/display-name fields for a new, unregistered host.
 */
export function HostListingContactFields({ listingKind, value, onChange, disabled = false }: {
  listingKind: 'service' | 'trip'
  value: HostListingContactInput
  onChange: (value: HostListingContactInput) => void
  disabled?: boolean
}) {
  const phoneId = useId()
  const [selected, setSelected] = useState<Selected | null>(null)
  const [mode, setMode] = useState<'search' | 'existing' | 'new'>(
    () => (value.email?.trim() || value.phone?.trim() ? 'new' : 'search'))

  function reset() {
    setSelected(null)
    setMode('search')
    onChange({ email: '', phone: '', countryCode: '+91' })
  }

  return (
    <fieldset disabled={disabled} className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <legend className="px-1 text-sm font-semibold">Host</legend>

      {mode === 'search' && (
        <HostListingContactPicker listingKind={listingKind} disabled={disabled}
          onSelect={(option, contact) => {
            setSelected({
              label: option.label,
              detail: [option.email, option.phone].filter(Boolean).join(' · '),
              registered: option.source === 'registered',
            })
            setMode('existing')
            onChange(contact)
          }}
          onNewHost={() => { setMode('new'); onChange({ email: '', phone: '', countryCode: '+91' }) }} />
      )}

      {mode === 'existing' && selected && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary px-3 py-2.5">
          <UserRound aria-hidden className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{selected.label}</p>
            <p className="truncate text-xs text-muted-foreground">{selected.detail}</p>
          </div>
          <button type="button" onClick={reset} className="text-sm font-medium text-primary hover:underline">Change</button>
        </div>
      )}

      {/* Only hosts without an account need a public name; registered hosts use their profile. */}
      {(mode === 'new' || (mode === 'existing' && selected && !selected.registered)) && (
        <label className="block text-sm font-medium">
          Host display name
          <input type="text" autoComplete="off" maxLength={80} value={value.name || ''}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder="Shown to travellers" className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2" />
        </label>
      )}

      {mode === 'new' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Host email
              <input type="email" autoComplete="off" value={value.email || ''}
                onChange={(e) => onChange({ ...value, email: e.target.value })}
                placeholder="host@example.com" className="mt-1 w-full rounded-lg border border-border bg-secondary px-3 py-2" />
            </label>
            <div>
              <label className="block text-sm font-medium" htmlFor={phoneId}>Host phone</label>
              <div className="mt-1 flex gap-2">
                <select aria-label="Host phone country code" value={value.countryCode || '+91'}
                  onChange={(e) => onChange({ ...value, countryCode: e.target.value })}
                  className="rounded-lg border border-border bg-secondary px-2 py-2">
                  {Object.entries(PHONE_COUNTRY_CODES).map(([code, rule]) => (
                    <option key={code} value={code}>{rule.name} {code}</option>
                  ))}
                </select>
                <input id={phoneId} type="tel" autoComplete="off" value={value.phone || ''}
                  onChange={(e) => onChange({ ...value, phone: e.target.value })}
                  placeholder="Mobile number" className="min-w-0 flex-1 rounded-lg border border-border bg-secondary px-3 py-2" />
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Email or phone required. Kept private.</p>
          <button type="button" onClick={reset} className="text-sm font-medium text-primary hover:underline">
            Search existing hosts instead
          </button>
        </>
      )}
    </fieldset>
  )
}

export function HostListingAssignmentPanel({ kind, listingId, hostId, assignment }: {
  kind: 'service' | 'trip'
  listingId: string
  hostId?: string | null
  assignment?: HostListingAssignment | null
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const code = Object.keys(PHONE_COUNTRY_CODES).find((c) => assignment?.phone?.startsWith(c)) || '+91'
  const [contact, setContact] = useState<HostListingContactInput>({
    name: assignment?.host_name || '', email: assignment?.email || '', phone: assignment?.phone?.slice(code.length) || '', countryCode: code,
  })
  async function save() {
    setSaving(true)
    setError(null)
    try {
      await updateHostListingContact(kind, listingId, contact)
      setEditing(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save host contact')
    } finally { setSaving(false) }
  }
  return (
    <section className="space-y-3 rounded-xl border border-border p-4">
      <h2 className="text-sm font-semibold">Host ownership</h2>
      <p className="text-sm text-muted-foreground">
        {hostId ? 'Linked to host account' : assignment?.status === 'conflict'
          ? 'Contact conflict — email and phone match different accounts. Correct the contact to link safely.'
          : assignment ? 'Awaiting host signup / contact verification' : 'No host assigned'}
      </p>
      {assignment && <p className="break-all text-xs text-muted-foreground">{[assignment.host_name, assignment.email, assignment.phone].filter(Boolean).join(' · ')}</p>}
      {!hostId && !editing && <button type="button" onClick={() => setEditing(true)} className="text-sm font-medium text-primary hover:underline">
        {assignment ? 'Correct host contact' : 'Assign to a host by email or phone'}
      </button>}
      {!hostId && editing && <>
        <HostListingContactFields listingKind={kind} value={contact} onChange={setContact} disabled={saving} />
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-3">
          <button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">
            {saving ? 'Saving…' : 'Save host contact'}
          </button>
          <button type="button" disabled={saving} onClick={() => setEditing(false)} className="text-sm text-muted-foreground">Cancel</button>
        </div>
      </>}
    </section>
  )
}