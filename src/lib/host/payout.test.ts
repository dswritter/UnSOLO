import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/http'
import { resolvePayoutUpdate } from './payout'
import { isPayoutConfigured, maskAccount, toPayout } from './shape'

const fieldOf = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    if (e instanceof ApiError) return e.extra.field
    throw e
  }
  throw new Error('expected an ApiError')
}

describe('resolvePayoutUpdate', () => {
  it('normalises UPI and bank details', () => {
    expect(resolvePayoutUpdate({ method: 'upi', upiId: ' Ravi@OkAxis ' }, null)).toMatchObject({ upi_id: 'ravi@okaxis', payout_method: 'upi', bank_account_number: null })
    expect(resolvePayoutUpdate({ method: 'bank', bankAccountName: 'Ravi K', bankAccountNumber: '1234 5678 9012', bankIfsc: 'hdfc0001234' }, null))
      .toMatchObject({ bank_account_number: '123456789012', bank_ifsc: 'HDFC0001234', payout_method: 'bank' })
  })

  it('rejects bad values with the field', () => {
    expect(fieldOf(() => resolvePayoutUpdate({ method: 'upi', upiId: 'ravi' }, null))).toBe('upiId')
    expect(fieldOf(() => resolvePayoutUpdate({ method: 'upi' }, null))).toBe('upiId')
    expect(fieldOf(() => resolvePayoutUpdate({ method: 'bank', bankAccountName: 'R', bankAccountNumber: '123456789', bankIfsc: 'HDFC0001234' }, null))).toBe('bankAccountName')
    expect(fieldOf(() => resolvePayoutUpdate({ method: 'bank', bankAccountName: 'Ravi', bankAccountNumber: '12345', bankIfsc: 'HDFC0001234' }, null))).toBe('bankAccountNumber')
    expect(fieldOf(() => resolvePayoutUpdate({ method: 'bank', bankAccountName: 'Ravi', bankAccountNumber: '123456789', bankIfsc: 'HDFC1001234' }, null))).toBe('bankIfsc')
    expect(fieldOf(() => resolvePayoutUpdate({ method: 'bank', upiId: 'ravi@okaxis' }, null))).toBe('bankAccountNumber')
  })

  it('keeps the saved account number when it is omitted', () => {
    const saved = { bank_account_name: 'Ravi', bank_account_number: '123456789012', bank_ifsc: 'HDFC0001234', upi_id: null }
    expect(resolvePayoutUpdate({ method: 'bank', bankAccountName: 'Ravi Kumar', bankIfsc: 'HDFC0001234' }, saved).bank_account_number).toBe('123456789012')
    // Clearing name and IFSC (switching to UPI only) clears the saved number too.
    expect(resolvePayoutUpdate({ method: 'upi', upiId: 'ravi@okaxis', bankAccountName: null, bankIfsc: '' }, saved))
      .toMatchObject({ bank_account_name: null, bank_account_number: null, bank_ifsc: null })
  })
})

describe('payout shape', () => {
  it('masks to the last 4 digits and reports configured', () => {
    expect(maskAccount('123456789012')).toBe('••••••••9012')
    expect(toPayout({ payout_method: 'bank', bank_account_number: '123456789012', bank_ifsc: 'HDFC0001234', bank_account_name: 'Ravi' }))
      .toEqual({ method: 'bank', upiId: null, bankAccountName: 'Ravi', bankAccountNumberMasked: '••••••••9012', bankIfsc: 'HDFC0001234', configured: true })
    expect(isPayoutConfigured({ upi_id: 'ravi' })).toBe(false)
    expect(isPayoutConfigured({ upi_id: 'ravi@okaxis' })).toBe(true)
    expect(isPayoutConfigured(null)).toBe(false)
  })
})
