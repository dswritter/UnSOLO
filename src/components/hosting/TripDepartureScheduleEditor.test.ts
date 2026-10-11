// @vitest-environment happy-dom
import { createElement, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { TripDeparturePair } from '@/lib/trip-departure-recurrence'

vi.mock('@/lib/utils', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/utils')>(),
  listingScheduleTodayISO: () => '2026-10-12',
}))
import { TripDepartureScheduleEditor } from './TripDepartureScheduleEditor'

afterEach(cleanup)

function renderEditor(initial: TripDeparturePair[] = [{ dep: '', ret: '' }], disabled = false) {
  const changed = vi.fn()
  function Harness() {
    const [rows, setRows] = useState(initial)
    return createElement(TripDepartureScheduleEditor, {
      rows, disabled,
      onChange: (next) => { changed(next); setRows(next) },
    })
  }
  render(createElement(Harness))
  return changed
}

function setRange(start = '2026-10-12', ret = '2026-10-14', until = '2026-10-15') {
  fireEvent.change(screen.getByLabelText('First departure / range start'), { target: { value: start } })
  fireEvent.change(screen.getByLabelText('First return / arrival'), { target: { value: ret } })
  fireEvent.change(screen.getByLabelText('Repeat through (last departure)'), { target: { value: until } })
}
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }))
const generate = () => click('Generate departures')

describe('trip departure schedule controls', () => {
  it('offers all frequencies without restricting the editor to staff', () => {
    renderEditor()
    for (const name of ['Specific dates', 'Daily', 'Weekly', 'Monthly']) {
      expect(screen.getByRole('button', { name, exact: true })).toBeDefined()
    }
    expect(screen.getByRole('button', { name: 'Specific dates', exact: true }).getAttribute('aria-pressed')).toBe('true')
  })
  it('does not change existing rows just by selecting a frequency', () => {
    const changed = renderEditor([{ dep: '2026-10-12', ret: '2026-10-14' }])
    click('Daily')
    click('Weekly')
    click('Monthly')
    click('Specific dates')
    expect(changed).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Departure date 1') as HTMLInputElement).value).toBe('2026-10-12')
  })
  it('generates daily dates, previews the count and preserves return offsets', () => {
    const changed = renderEditor()
    click('Daily')
    setRange()
    expect(screen.getByText('4 departures: 2026-10-12 → 2026-10-15')).toBeDefined()
    expect(changed).not.toHaveBeenCalled()
    generate()
    expect(changed).toHaveBeenLastCalledWith([
      { dep: '2026-10-12', ret: '2026-10-14' }, { dep: '2026-10-13', ret: '2026-10-15' },
      { dep: '2026-10-14', ret: '2026-10-16' }, { dep: '2026-10-15', ret: '2026-10-17' },
    ])
    expect((screen.getByLabelText('Return date 4') as HTMLInputElement).value).toBe('2026-10-17')
  })
  it('requires a weekday and allows selecting multiple weekdays', () => {
    const changed = renderEditor()
    click('Weekly')
    setRange('2026-10-12', '2026-10-14', '2026-10-25')
    expect((screen.getByRole('button', { name: 'Generate departures' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('Select at least one day of the week')
    click('Friday')
    click('Sunday')
    expect(screen.getByRole('button', { name: 'Friday' }).getAttribute('aria-pressed')).toBe('true')
    generate()
    const pairs = changed.mock.lastCall?.[0] as TripDeparturePair[]
    expect(pairs.map((p) => p.dep)).toEqual(['2026-10-16', '2026-10-18', '2026-10-23', '2026-10-25'])
    click('Sunday')
    expect(screen.getByRole('button', { name: 'Sunday' }).getAttribute('aria-pressed')).toBe('false')
  })
  it('allows multiple monthly dates and skips dates absent from a month', () => {
    const changed = renderEditor()
    click('Monthly')
    setRange('2027-01-01', '2027-01-03', '2027-03-31')
    click('Day 15 of month')
    click('Day 31 of month')
    generate()
    const pairs = changed.mock.lastCall?.[0] as TripDeparturePair[]
    expect(pairs.map((p) => p.dep)).toEqual(['2027-01-15', '2027-01-31', '2027-02-15', '2027-03-15', '2027-03-31'])
    expect(screen.getByText(/Dates missing from a month/)).toBeDefined()
  })
  it('adds to existing departures without dropping past or manual dates', () => {
    const changed = renderEditor([{ dep: '2025-01-01', ret: '2025-01-03' }, { dep: '2026-12-01', ret: '2026-12-03' }])
    click('Daily')
    setRange()
    generate()
    const pairs = changed.mock.lastCall?.[0] as TripDeparturePair[]
    expect(pairs).toHaveLength(6)
    expect(pairs[0].dep).toBe('2025-01-01')
    expect(pairs.at(-1)?.dep).toBe('2026-12-01')
  })
  it('replaces dates only when explicitly selected', () => {
    const changed = renderEditor([{ dep: '2026-12-01', ret: '2026-12-03' }])
    click('Daily')
    setRange()
    fireEvent.change(screen.getByLabelText('Apply generated dates'), { target: { value: 'replace' } })
    generate()
    expect(changed.mock.lastCall?.[0]).toHaveLength(4)
    expect((changed.mock.lastCall?.[0] as TripDeparturePair[]).some((row) => row.dep === '2026-12-01')).toBe(false)
  })
  it('prevents merging duplicate departures with different return dates', () => {
    const changed = renderEditor([{ dep: '2026-10-12', ret: '2026-10-13' }])
    click('Daily')
    setRange()
    generate()
    expect(changed).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('different return dates')
  })
  it('supports manual date edits, adding rows, removing rows and clearing the last row', () => {
    const changed = renderEditor()
    fireEvent.change(screen.getByLabelText('Departure date 1'), { target: { value: '2026-11-01' } })
    fireEvent.change(screen.getByLabelText('Return date 1'), { target: { value: '2026-11-03' } })
    click('Add another departure')
    expect(screen.getByLabelText('Departure date 2')).toBeDefined()
    click('Remove departure 2')
    click('Remove departure 1')
    expect(changed).toHaveBeenLastCalledWith([{ dep: '', ret: '' }])
  })
  it('shows long schedules progressively instead of hundreds of fields at once', () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ dep: `2026-11-${String(i + 1).padStart(2, '0')}`, ret: `2026-11-${String(i + 1).padStart(2, '0')}` }))
    renderEditor(rows)
    expect(screen.queryByLabelText('Departure date 11')).toBeNull()
    click('Show more dates (15 remaining)')
    expect(screen.getByLabelText('Departure date 25')).toBeDefined()
  })
  it('disables mutation controls while saving', () => {
    const changed = renderEditor([{ dep: '2026-10-12', ret: '2026-10-14' }], true)
    expect((screen.getByRole('button', { name: 'Daily' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Add another departure' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Departure date 1') as HTMLInputElement).disabled).toBe(true)
    expect(changed).not.toHaveBeenCalled()
  })
})