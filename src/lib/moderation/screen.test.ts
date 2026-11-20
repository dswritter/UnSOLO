import { describe, expect, it } from 'vitest'
import { screenText } from './screen'

describe('screenText', () => {
  it('hides Indian phone numbers but keeps dates and prices', () => {
    const r = screenText('Call me on +91 98765 43210 or 098765-43210. Leaving 12/01/2027, est. ₹14,000 each')
    expect(r.text).not.toMatch(/98765/)
    expect(r.text).toContain('12/01/2027')
    expect(r.text).toContain('₹14,000')
    expect(r.prompts).toContain('contact_hidden')
  })

  it('hides UPI ids and emails and flags money talk', () => {
    const r = screenText('Pay advance to riya.k@okhdfcbank or mail riya@gmail.com')
    expect(r.text).not.toMatch(/okhdfcbank|gmail/)
    expect(r.prompts).toEqual(expect.arrayContaining(['contact_hidden', 'money']))
    expect(r.hold).toBe(true)
  })

  it('flags per-person pricing as money', () => {
    expect(screenText('₹4500/person including stay').prompts).toContain('money')
    expect(screenText('Est. ₹6–9k each, split among ourselves').prompts).not.toContain('money')
  })

  it('lets the author confirm a non-commercial mention', () => {
    expect(screenText('₹4500 per person', { allowMoney: true }).hold).toBe(false)
  })

  it('disables outside links but keeps unsolo.in links', () => {
    const r = screenText('See https://bit.ly/x and https://unsolo.in/packages/spiti')
    expect(r.text).toContain('https://unsolo.in/packages/spiti')
    expect(r.text).not.toContain('https://bit.ly/x')
    expect(r.prompts).toContain('links_disabled')
  })

  it('holds blocklisted content for review', () => {
    expect(screenText('escort service available').hold).toBe(true)
    expect(screenText('Kasol cafes worth it?').hold).toBe(false)
  })
})
