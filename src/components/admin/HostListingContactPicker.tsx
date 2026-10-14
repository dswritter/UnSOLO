'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown, Loader2, Search, UserRound } from 'lucide-react'
import { searchHostListingContacts } from '@/actions/host-listing-search'
import { normalizeHostListingContact, type HostListingContactInput } from '@/lib/host-listing-contact'
import { HOST_SEARCH_QUERY_LIMIT, type HostListingContactOption } from '@/lib/host-listing-search'
import { PHONE_COUNTRY_CODES } from '@/lib/utils'

/** Adapt stored E.164 contacts to the same supported-country form validation.
 * A verified email remains usable even if the account has an unsupported phone. */
function contactForOption(option: HostListingContactOption): HostListingContactInput | null {
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

export function HostListingContactPicker({ listingKind, value, onChange, disabled = false }: {
  listingKind: 'service' | 'trip'
  value: HostListingContactInput
  onChange: (value: HostListingContactInput) => void
  disabled?: boolean
}) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<HostListingContactOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(-1)
  const [retry, setRetry] = useState(0)
  const [selection, setSelection] = useState<{ label: string; contact: HostListingContactInput } | null>(null)
  const selected = selection && selection.contact.email === (value.email || '') && selection.contact.phone === (value.phone || '')
    && selection.contact.countryCode === (value.countryCode || '+91') ? selection : null

  useEffect(() => {
    if (!open || disabled) return
    search.current?.focus()
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open, disabled])

  useEffect(() => {
    if (!open || disabled) return
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const results = await searchHostListingContacts(listingKind, query)
        if (!cancelled) { setOptions(results); setActive(-1) }
      } catch (err) {
        if (!cancelled) {
          setOptions([])
          setError(err instanceof Error ? err.message : 'Could not load hosts. Try again or enter their contact below.')
        }
      } finally { if (!cancelled) setLoading(false) }
    }, query ? 250 : 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [open, disabled, listingKind, query, retry])

  function select(option: HostListingContactOption) {
    const contact = contactForOption(option)
    if (!contact || disabled) return
    onChange(contact)
    setSelection({ label: option.label, contact })
    setOpen(false)
    trigger.current?.focus()
  }

  return (
    <div ref={root} className="space-y-2">
      <p className="text-sm font-medium">Reuse an existing host</p>
      <button id={`${id}-trigger`} ref={trigger} type="button" disabled={disabled}
        aria-expanded={open && !disabled} aria-controls={`${id}-search-panel`}
        onClick={() => { setOpen(!open); setOptions([]); setError(null); setLoading(true) }}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2.5 text-left text-sm disabled:opacity-50">
        <UserRound className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate">{selected ? selected.label : 'Choose or search an existing host'}</span>
        {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {selected && <p role="status" className="text-xs text-primary">Host contact filled in. Review it below before creating the listing.</p>}
      {open && !disabled && (
        <div id={`${id}-search-panel`} className="space-y-2 rounded-xl border border-border bg-secondary/50 p-3"
          onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() }
          }}>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input ref={search} type="search" role="combobox" aria-label="Search hosts" autoComplete="off"
              aria-autocomplete="list" aria-expanded={true} aria-controls={`${id}-results`}
              aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined}
              maxLength={HOST_SEARCH_QUERY_LIMIT} value={query} placeholder="Name, email, phone or previous listing title"
              onChange={event => { setQuery(event.target.value); setOptions([]); setActive(-1); setLoading(true); setError(null) }}
              onKeyDown={event => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault()
                  if (options.length) setActive(index => event.key === 'ArrowDown'
                    ? (index + 1) % options.length : (index <= 0 ? options.length - 1 : index - 1))
                } else if (event.key === 'Enter') {
                  event.preventDefault()
                  if (active >= 0 && options[active]) select(options[active])
                }
              }}
              className="w-full rounded-lg border border-border bg-background py-2.5 pl-9 pr-3 text-sm" />
          </div>
          <p className="text-xs text-muted-foreground">Registered hosts and contacts from previous trips, stays, activities and rentals.</p>
          {loading && <p role="status" className="flex items-center gap-2 py-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Searching hosts…</p>}
          {error && <div role="alert" className="space-y-2 text-sm text-red-400">
            <p>{error}</p>
            <button type="button" onClick={() => { setLoading(true); setRetry(n => n + 1) }} className="font-medium underline">Retry host search</button>
          </div>}
          <ul id={`${id}-results`} role="listbox" aria-label="Host suggestions" aria-busy={loading} className="max-h-72 space-y-1 overflow-y-auto">
            {!loading && options.map((option, index) => {
              const usable = !!contactForOption(option)
              return <li key={option.id} role="presentation">
                <button id={`${id}-option-${index}`} type="button" role="option" aria-selected={index === active}
                  disabled={!usable} onClick={() => select(option)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${active === index ? 'border-primary bg-primary/10' : 'border-transparent hover:border-border hover:bg-background'}`}>
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="break-words text-sm font-semibold">{option.label}</span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">{option.source === 'registered' ? 'Registered host' : 'Previous listing contact'}</span>
                  </span>
                  <span className="mt-1 block break-all text-xs text-muted-foreground">{[option.email, option.phone].filter(Boolean).join(' · ')}</span>
                  {option.subtitle && <span className="mt-1 block text-xs text-muted-foreground">{option.subtitle}</span>}
                  {!usable && <span className="mt-1 block text-xs text-red-400">This phone country is not supported. Enter a supported contact below.</span>}
                </button>
              </li>
            })}
          </ul>
          {!loading && !error && options.length === 0 && <p role="status" className="py-2 text-sm text-muted-foreground">No matching hosts. Enter a new host’s email or phone below.</p>}
          <button type="button" onClick={() => {
            setSelection(null)
            onChange({ email: '', phone: '', countryCode: '+91' })
            setOpen(false)
            trigger.current?.focus()
          }} className="text-sm font-medium text-primary hover:underline">Enter a new host manually</button>
        </div>
      )}
    </div>
  )
}