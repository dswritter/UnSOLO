// @vitest-environment happy-dom
import { createElement, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { RentalExtrasDraft } from '@/lib/rental-pricing'
import { rentalExtrasInputFromDraft, rentalExtrasRow } from '@/lib/rental-pricing'
import { RentalExtrasEditor } from './RentalExtrasEditor'

afterEach(cleanup)

let latest: RentalExtrasDraft | undefined
function Harness() {
  const [value, setValue] = useState<RentalExtrasDraft | undefined>(undefined)
  latest = value
  return createElement(RentalExtrasEditor, { id: 'x', value, onChange: setValue })
}

describe('progressive rental extras', () => {
  it('shows only add buttons and stores nothing until an option is added', () => {
    render(createElement(Harness))
    expect(screen.queryByLabelText(/24-hour price/)).toBeNull()
    expect(screen.queryByLabelText(/security deposit/i)).toBeNull()
    expect(rentalExtrasRow(rentalExtrasInputFromDraft(latest))).toEqual({})
  })

  it('adds, validates and removes options independently', () => {
    render(createElement(Harness))
    fireEvent.click(screen.getByRole('button', { name: /Daytime rate/ }))
    expect(rentalExtrasRow(rentalExtrasInputFromDraft(latest))).toEqual({ error: 'Daytime price must be greater than 0' })
    fireEvent.change(screen.getByLabelText(/Daytime price/), { target: { value: '1300' } })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '06:00' } })
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '19:00' } })
    fireEvent.click(screen.getByRole('button', { name: /Security deposit/ }))
    fireEvent.change(screen.getByLabelText(/Refundable security deposit/), { target: { value: '2000' } })
    expect(rentalExtrasRow(rentalExtrasInputFromDraft(latest))).toEqual({
      daytime_price_paise: 130000, daytime_start: '06:00', daytime_end: '19:00', security_deposit_paise: 200000,
    })
    expect(screen.queryByRole('button', { name: /Daytime rate/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Remove daytime rate' }))
    expect(rentalExtrasRow(rentalExtrasInputFromDraft(latest))).toEqual({ security_deposit_paise: 200000 })
    expect(screen.getByRole('button', { name: /Daytime rate/ })).toBeTruthy()
  })
})
