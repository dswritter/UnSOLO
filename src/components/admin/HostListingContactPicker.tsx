'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, Search, UserRound } from 'lucide-react'
import { searchHostListingContacts } from '@/actions/host-listing-search'
import { normalizeHostListingContact, type HostListingContactInput } from '@/lib/host-listing-contact'
import { HOST_SEARCH_QUERY_LIMIT, type HostListingContactOption } from '@/lib/host-listing-search'
import { PHONE_COUNTRY_CODES } from '@/lib/utils'

/** Adapt stored E.164 contacts to the same supported-country form validation.
 * A verified email remains usable even if the account has an unsupported phone. */
export function contactForOption(option: HostListingContactOption): HostListingContactInput | null {
  const countryCode = Object.keys(PHONE_COUNTRY_CODES).find(code => option.phone?.startsWith(code))
  const contact: HostListingContactInput = { email: option.email || '', phone: '', countryCode: countryCode || '+91' }
  if (countryCode && option.phone) {
    const local = option.phone.slice(countryCode.length)
    try {
      normalizeHostListingContact({ phone: local, countryCode })
      contact.phone = local
    } catch { /* Keep a usable email without copying an invalid phone. */ }
  }
  return contact.email || contact.phone ? contact : null
}

function matches(option: HostListingContactOption, term: string) {
  const digits = term.replace(/\D/g, '')
  return [option.label, option.email, option.subtitle].some(v => v?.toLowerCase().includes(term))
    || (!!option.phone && (option.phone.includes(term) || (digits.length > 0 && option.phone.includes(digits))))
}

/**
 * Host search with instant local filtering over already-fetched hosts; the server
 * search runs debounced in the background and results are cached per query.
 */
export function HostListingContactPicker({ listingKind, disabled = false, onSelect, onNewHost }: {
  listingKind: 'service' | 'trip'
  disabled?: boolean
  onSelect: (option: HostListingContactOption, contact: HostListingContactInput) => void
  onNewHost: () => void
}) {
  const id = useId()
  const fetched = useRef(new Set<string>())
  const latest = useRef(0)
  const [query, setQuery] = useState('')
  const [byQuery, setByQuery] = useState<Record<string, HostListingContactOption[]>>({})
  const [pending, setPending] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(-1)
  const [retry, setRetry] = useState(0)
  const [focused, setFocused] = useState(false)
  const term = query.trim().toLowerCase()

  useEffect(() => {
    if (disabled) return
    const key = term
    if (fetched.current.has(key)) return
    const request = ++latest.current
    const timer = setTimeout(async () => {
      setPending(n => n + 1)
      try {
        const results = await searchHostListingContacts(listingKind, key)
        fetched.current.add(key)
        setByQuery(prev => ({ ...prev, [key]: results }))
        if (request === latest.current) setError(null)
      } catch (err) {
        if (request === latest.current) setError(err instanceof Error ? err.message : 'Could not load hosts')
      } finally { setPending(n => n - 1) }
    }, key ? 200 : 0)
    return () => clearTimeout(timer)
  }, [disabled, listingKind, term, retry])

  const known = useMemo(() => {
    const seen = new Map<string, HostListingContactOption>()
    for (const list of Object.values(byQuery)) for (const o of list) if (!seen.has(o.id)) seen.set(o.id, o)
    return [...seen.values()]
  }, [byQuery])

  const options = useMemo(() => {
    const exact = byQuery[term]
    const pool = term ? known.filter(o => matches(o, term)) : (exact ?? known)
    if (exact) {
      const ids = new Set(exact.map(o => o.id))
      return [...exact, ...pool.filter(o => !ids.has(o.id))].slice(0, 20)
    }
    return pool.slice(0, 20)
  }, [byQuery, known, term])

  function pick(option: HostListingContactOption) {
    const contact = contactForOption(option)
    if (contact && !disabled) onSelect(option, contact)
  }

  const showList = focused || term.length > 0
  return (
    <div className="space-y-2" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false) }}>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <input type="search" role="combobox" aria-label="Search hosts" autoComplete="off" disabled={disabled}
          aria-autocomplete="list" aria-expanded={showList} aria-controls={`${id}-results`}
          aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined}
          maxLength={HOST_SEARCH_QUERY_LIMIT} value={query} placeholder="Search host by name, email or phone"
          onFocus={() => setFocused(true)}
          onChange={event => { setQuery(event.target.value); setActive(-1) }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              if (options.length) setActive(index => event.key === 'ArrowDown'
                ? (index + 1) % options.length : (index <= 0 ? options.length - 1 : index - 1))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              if (active >= 0 && options[active]) pick(options[active])
            } else if (event.key === 'Escape') {
              event.preventDefault()
              setQuery('')
              setFocused(false)
            }
          }}
          className="w-full rounded-lg border border-border bg-secondary py-2.5 pl-9 pr-9 text-sm disabled:opacity-50" />
        {pending > 0 && <Loader2 aria-label="Searching hosts" className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {error && <div role="alert" className="flex items-center gap-3 text-sm text-red-400">
        <span>{error}</span>
        <button type="button" onClick={() => setRetry(n => n + 1)} className="font-medium underline">Retry</button>
      </div>}
      {showList && (
        <ul id={`${id}-results`} role="listbox" aria-label="Host suggestions" aria-busy={pending > 0}
          className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border bg-card p-1">
          {options.map((option, index) => {
            const usable = !!contactForOption(option)
            return <li key={option.id} role="presentation">
              <button id={`${id}-option-${index}`} type="button" role="option" aria-selected={index === active}
                disabled={!usable} onClick={() => pick(option)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors disabled:opacity-50 ${active === index ? 'bg-primary/10' : 'hover:bg-secondary'}`}>
                <UserRound aria-hidden className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{option.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {usable ? [option.email, option.phone].filter(Boolean).join(' · ') : 'Unsupported phone country'}
                  </span>
                </span>
                {option.source === 'registered' && <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">Registered</span>}
              </button>
            </li>
          })}
          {pending === 0 && !error && options.length === 0 && (
            <li role="presentation" className="px-3 py-2 text-sm text-muted-foreground">No matching hosts</li>
          )}
        </ul>
      )}
      <button type="button" disabled={disabled} onClick={onNewHost}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-50">
        <Plus className="h-4 w-4" /> New host
      </button>
    </div>
  )
}
