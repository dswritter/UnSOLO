'use client'

import { useId, useMemo, useState } from 'react'
import { CalendarDays, Plus, Repeat2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn, listingScheduleTodayISO } from '@/lib/utils'
import {
  generateRecurringTripDepartures,
  mergeTripDepartures,
  tripScheduleMaxDate,
  MAX_TRIP_DEPARTURES,
  type TripDepartureFrequency,
  type TripDeparturePair,
} from '@/lib/trip-departure-recurrence'

const FREQUENCIES = [
  { value: 'specific', label: 'Specific dates' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
] as const
const WEEKDAYS = [
  { day: 1, label: 'Monday', short: 'Mon' },
  { day: 2, label: 'Tuesday', short: 'Tue' },
  { day: 3, label: 'Wednesday', short: 'Wed' },
  { day: 4, label: 'Thursday', short: 'Thu' },
  { day: 5, label: 'Friday', short: 'Fri' },
  { day: 6, label: 'Saturday', short: 'Sat' },
  { day: 0, label: 'Sunday', short: 'Sun' },
]

/** A bounded recurrence generator feeding the existing booking/draft date pairs.
 * Selecting a frequency never changes saved rows until Generate is clicked. */
export function TripDepartureScheduleEditor({ rows, onChange, disabled = false }: {
  rows: TripDeparturePair[]
  onChange: (rows: TripDeparturePair[]) => void
  disabled?: boolean
}) {
  const id = useId()
  const today = listingScheduleTodayISO()
  const maxDate = tripScheduleMaxDate(today)
  const first = rows.find((row) => row.dep && row.dep >= today)
  const [frequency, setFrequency] = useState<'specific' | TripDepartureFrequency>('specific')
  const [startDate, setStartDate] = useState(first?.dep || '')
  const [firstReturnDate, setFirstReturnDate] = useState(first?.ret || '')
  const [untilDate, setUntilDate] = useState('')
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [monthDays, setMonthDays] = useState<number[]>([])
  const [mode, setMode] = useState<'add' | 'replace'>('add')
  const [visibleCount, setVisibleCount] = useState(10)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const generated = useMemo(() => {
    if (frequency === 'specific' || !startDate || !firstReturnDate || !untilDate) return null
    try {
      return { pairs: generateRecurringTripDepartures({ frequency, startDate, firstReturnDate, untilDate, weekdays, monthDays }, today), error: null }
    } catch (e) {
      return { pairs: null, error: e instanceof Error ? e.message : 'Could not generate departures' }
    }
  }, [frequency, startDate, firstReturnDate, untilDate, weekdays, monthDays, today])

  function applyGenerated() {
    setError(null)
    setNotice(null)
    if (!generated?.pairs) {
      setError(generated?.error || 'Enter the first departure, first return, and repeat-through dates')
      return
    }
    try {
      const next = mode === 'replace' ? generated.pairs : mergeTripDepartures(rows, generated.pairs)
      onChange(next)
      setVisibleCount(10)
      setNotice(`${next.length} departures in your schedule. Review the dates below, then save the trip.`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update schedule') }
  }

  function updateRow(index: number, field: 'dep' | 'ret', value: string) {
    setError(null)
    setNotice(null)
    if (value && value < today && value !== rows[index][field]) {
      setError('New departure and return dates cannot be in the past')
      return
    }
    onChange(rows.map((row, i) => i === index ? { ...row, [field]: value } : row))
  }

  return (
    <section className="space-y-4" aria-labelledby={`${id}-title`}>
      <div>
        <h3 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-primary" /> Offered departures *
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">Add individual dates or generate a repeating schedule.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Departure frequency">
        {FREQUENCIES.map((option) => (
          <button key={option.value} type="button" disabled={disabled} aria-pressed={frequency === option.value}
            onClick={() => { setFrequency(option.value); setError(null); setNotice(null) }}
            className={cn('rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50',
              frequency === option.value ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground')}>
            {option.label}
          </button>
        ))}
      </div>

      {frequency !== 'specific' && (
        <fieldset disabled={disabled} className="space-y-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
          <legend className="px-1 text-xs font-semibold text-primary">Repeat departures</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="min-w-0 text-xs text-muted-foreground">
              First departure / range start
              <Input type="date" min={today} max={maxDate} value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setNotice(null) }} className="mt-1 bg-secondary border-border" />
            </label>
            <label className="min-w-0 text-xs text-muted-foreground">
              First return / arrival
              <Input type="date" min={startDate || today} max={maxDate} value={firstReturnDate}
                onChange={(e) => { setFirstReturnDate(e.target.value); setNotice(null) }} className="mt-1 bg-secondary border-border" />
            </label>
            <label className="min-w-0 text-xs text-muted-foreground">
              Repeat through (last departure)
              <Input type="date" min={startDate || today} max={maxDate} value={untilDate}
                onChange={(e) => { setUntilDate(e.target.value); setNotice(null) }} className="mt-1 bg-secondary border-border" />
            </label>
          </div>

          {frequency === 'weekly' && (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-xs font-medium">Depart on these days of the week</legend>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map(({ day, label, short }) => (
                  <button type="button" key={day} aria-label={label} aria-pressed={weekdays.includes(day)}
                    onClick={() => { setWeekdays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]); setNotice(null) }}
                    className={cn('min-h-9 rounded-lg border px-3 text-sm transition-colors', weekdays.includes(day)
                      ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-secondary/50 text-muted-foreground')}>
                    {short}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {frequency === 'monthly' && (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-xs font-medium">Depart on these dates of each month</legend>
              <div className="grid max-w-md grid-cols-7 gap-2">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <button type="button" key={day} aria-label={`Day ${day} of month`} aria-pressed={monthDays.includes(day)}
                    onClick={() => { setMonthDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]); setNotice(null) }}
                    className={cn('min-h-9 rounded-lg border text-sm transition-colors', monthDays.includes(day)
                      ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-secondary/50 text-muted-foreground')}>
                    {day}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Select multiple dates, e.g. 1, 15 and 28. Dates missing from a month (such as February 30) are skipped.</p>
            </fieldset>
          )}

          <p className="text-xs text-muted-foreground">
            {frequency === 'daily' ? 'Departs every day in the range. ' : ''}
            Return dates keep the same gap as your first departure and return. All dates must be within the next two years.
          </p>
          {generated?.pairs && (
            <p className="text-sm font-medium text-primary" role="status">
              {generated.pairs.length} departures: {generated.pairs[0].dep} → {generated.pairs.at(-1)?.dep}
            </p>
          )}
          {generated?.error && <p role="alert" className="text-xs text-red-400">{generated.error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-muted-foreground">
              Apply dates
              <select aria-label="Apply generated dates" value={mode} onChange={(e) => setMode(e.target.value as 'add' | 'replace')}
                className="ml-2 rounded-lg border border-border bg-secondary px-2 py-2 text-sm text-foreground">
                <option value="add">Add to existing departures</option>
                <option value="replace">Replace existing departures</option>
              </select>
            </label>
            <Button type="button" size="sm" onClick={applyGenerated} disabled={!generated?.pairs} className="gap-1.5">
              <Repeat2 className="h-3.5 w-3.5" /> Generate departures
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Only generated dates are saved, not an endless recurrence. Extend the range later to add more departures.</p>
        </fieldset>
      )}

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
      <div className="space-y-3">
        {rows.length > 1 && <p className="text-xs text-muted-foreground">{rows.length} departure rows — edit or remove individual dates below.</p>}
        {rows.slice(0, visibleCount).map((row, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 sm:max-w-xl">
            <label className="min-w-0 text-xs text-muted-foreground">
              Departure date
              <Input type="date" disabled={disabled} aria-label={`Departure date ${i + 1}`} min={row.dep && row.dep < today ? row.dep : today}
                max={maxDate} value={row.dep} onChange={(e) => updateRow(i, 'dep', e.target.value)} className="mt-1 bg-secondary border-border" />
            </label>
            <label className="min-w-0 text-xs text-muted-foreground">
              Return / arrival date
              <Input type="date" disabled={disabled} aria-label={`Return date ${i + 1}`} min={row.dep || today}
                max={maxDate} value={row.ret} onChange={(e) => updateRow(i, 'ret', e.target.value)} className="mt-1 bg-secondary border-border" />
            </label>
            <button type="button" disabled={disabled} aria-label={`Remove departure ${i + 1}`}
              onClick={() => { onChange(rows.length === 1 ? [{ dep: '', ret: '' }] : rows.filter((_, j) => i !== j)); setNotice(null) }}
              className="rounded-lg p-2 text-red-400 hover:bg-red-500/10 disabled:opacity-50">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {rows.length > visibleCount && <Button type="button" size="sm" variant="outline" onClick={() => setVisibleCount((n) => n + 20)}>
          Show more dates ({rows.length - visibleCount} remaining)
        </Button>}
        <Button type="button" size="sm" variant="outline" disabled={disabled || rows.length >= MAX_TRIP_DEPARTURES}
          onClick={() => { onChange([...rows, { dep: '', ret: '' }]); setVisibleCount(rows.length + 1); setNotice(null) }} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add another departure
        </Button>
      </div>
    </section>
  )
}