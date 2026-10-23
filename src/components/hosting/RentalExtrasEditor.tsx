'use client'

import { Plus, X } from 'lucide-react'
import type { RentalExtrasDraft } from '@/lib/rental-pricing'

const INPUT = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none'

type Key = 'fullDay' | 'daytime' | 'deposit'

function num(v: string) { return v === '' ? null : Number(v) }

/**
 * Optional rental pricing, added one option at a time. Nothing is filled in or
 * offered to travellers until the host explicitly adds it.
 */
export function RentalExtrasEditor({ id, value, onChange }: {
  id: string
  value: RentalExtrasDraft | undefined
  onChange: (next: RentalExtrasDraft) => void
}) {
  const v = value ?? {}
  const has = { fullDay: 'fullDayPriceRupees' in v, daytime: 'daytimePriceRupees' in v, deposit: 'securityDepositRupees' in v }

  function add(key: Key) {
    if (key === 'fullDay') onChange({ ...v, fullDayPriceRupees: null })
    if (key === 'daytime') onChange({ ...v, daytimePriceRupees: null, daytimeStart: '', daytimeEnd: '' })
    if (key === 'deposit') onChange({ ...v, securityDepositRupees: null })
  }
  function remove(key: Key) {
    const next = { ...v }
    if (key === 'fullDay') delete next.fullDayPriceRupees
    if (key === 'daytime') { delete next.daytimePriceRupees; delete next.daytimeStart; delete next.daytimeEnd }
    if (key === 'deposit') delete next.securityDepositRupees
    onChange(next)
  }
  const removeButton = (key: Key, label: string) => (
    <button type="button" onClick={() => remove(key)} aria-label={`Remove ${label}`}
      className="mb-2 shrink-0 rounded-full p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-500">
      <X className="h-4 w-4" />
    </button>
  )

  const addable: { key: Key; label: string }[] = [
    { key: 'fullDay' as const, label: '24-hour rate' },
    { key: 'daytime' as const, label: 'Daytime rate' },
    { key: 'deposit' as const, label: 'Security deposit' },
  ].filter(o => !has[o.key])

  return (
    <div id={id} className="space-y-2">
      {has.fullDay && (
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1 text-xs font-semibold">
            24-hour price (₹)
            <input type="number" min="1" placeholder="e.g. 1600" value={v.fullDayPriceRupees ?? ''}
              onChange={e => onChange({ ...v, fullDayPriceRupees: num(e.target.value) })} className={`mt-1 ${INPUT}`} />
          </label>
          {removeButton('fullDay', '24-hour rate')}
        </div>
      )}
      {has.daytime && (
        <div className="flex items-end gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
            <label className="text-xs font-semibold">
              Daytime price (₹)
              <input type="number" min="1" placeholder="e.g. 1300" value={v.daytimePriceRupees ?? ''}
                onChange={e => onChange({ ...v, daytimePriceRupees: num(e.target.value) })} className={`mt-1 ${INPUT}`} />
            </label>
            <label className="text-xs font-semibold">
              From
              <input type="time" value={v.daytimeStart ?? ''} onChange={e => onChange({ ...v, daytimeStart: e.target.value })}
                className={`mt-1 ${INPUT}`} />
            </label>
            <label className="text-xs font-semibold">
              Until
              <input type="time" value={v.daytimeEnd ?? ''} onChange={e => onChange({ ...v, daytimeEnd: e.target.value })}
                className={`mt-1 ${INPUT}`} />
            </label>
          </div>
          {removeButton('daytime', 'daytime rate')}
        </div>
      )}
      {has.deposit && (
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1 text-xs font-semibold">
            Refundable security deposit (₹ per unit)
            <input type="number" min="1" placeholder="e.g. 2000" value={v.securityDepositRupees ?? ''}
              onChange={e => onChange({ ...v, securityDepositRupees: num(e.target.value) })} className={`mt-1 ${INPUT}`} />
          </label>
          {removeButton('deposit', 'security deposit')}
        </div>
      )}
      {addable.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {addable.map(o => (
            <button key={o.key} type="button" onClick={() => add(o.key)}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary">
              <Plus className="h-3 w-3" /> {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
