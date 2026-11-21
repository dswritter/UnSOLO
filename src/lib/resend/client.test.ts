import { beforeEach, describe, expect, it, vi } from 'vitest'

const sent: unknown[] = []
vi.mock('resend', () => ({
  Resend: class { emails = { send: async (p: unknown) => { sent.push(p); return { data: { id: 'x' }, error: null } } } },
}))

describe('getResend', () => {
  beforeEach(() => { sent.length = 0; process.env.RESEND_API_KEY = 're_test' })

  it('never mails phone-only placeholder addresses', async () => {
    const { getResend } = await import('./client')
    const r = await getResend().emails.send({ from: 'a@unsolo.in', to: '9876543210@phone.unsolo.in', subject: 's', html: 'h' })
    expect(r).toEqual({ data: null, error: null })
    expect(sent).toHaveLength(0)
    await getResend().emails.send({ from: 'a@unsolo.in', to: ['asha@example.com', '9876543210@phone.unsolo.in'], subject: 's', html: 'h' })
    expect(sent).toEqual([expect.objectContaining({ to: ['asha@example.com'] })])
  })
})
