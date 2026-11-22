/** Payout details rules (same as the web `updatePayoutDetails` in src/actions/payout.ts). */
import { ApiError } from '@/lib/api/http'
import type { PayoutRow } from './shape'

const UPI_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/
const ACCOUNT_RE = /^[0-9]{9,18}$/

export type PayoutInput = {
  method: 'upi' | 'bank'
  upiId?: string | null
  bankAccountName?: string | null
  bankAccountNumber?: string | null
  bankIfsc?: string | null
}

const keep = (input: string | null | undefined, saved: unknown) =>
  input === undefined ? (typeof saved === 'string' ? saved : null) : input

/**
 * The profile columns to save. An omitted field keeps the saved value (the app only ever sees the
 * masked account number); null or "" clears it. Clearing both the bank name and IFSC without sending
 * an account number clears the saved number too, so switching to UPI-only works.
 */
export function resolvePayoutUpdate(input: PayoutInput, saved: PayoutRow | null) {
  const upi = (keep(input.upiId, saved?.upi_id) || '').trim().toLowerCase() || null
  const bankName = (keep(input.bankAccountName, saved?.bank_account_name) || '').trim() || null
  const bankIfsc = (keep(input.bankIfsc, saved?.bank_ifsc) || '').trim().toUpperCase() || null
  let bankAcc = (keep(input.bankAccountNumber, saved?.bank_account_number) || '').replace(/\s+/g, '') || null
  if (input.bankAccountNumber === undefined && !bankName && !bankIfsc) bankAcc = null

  if (upi && !UPI_RE.test(upi)) {
    throw new ApiError('bad_request', 'Invalid UPI ID. Use the format name@bank (e.g. ravi@okaxis).', { field: 'upiId' })
  }
  if (bankName || bankAcc || bankIfsc) {
    if (!bankName || bankName.length < 2) throw new ApiError('bad_request', 'Enter the account holder name.', { field: 'bankAccountName' })
    if (!bankAcc || !ACCOUNT_RE.test(bankAcc)) throw new ApiError('bad_request', 'Enter a valid account number (9–18 digits).', { field: 'bankAccountNumber' })
    if (!bankIfsc || !IFSC_RE.test(bankIfsc)) throw new ApiError('bad_request', 'Enter a valid IFSC code (e.g. HDFC0001234).', { field: 'bankIfsc' })
  }
  if (input.method === 'upi' && !upi) {
    throw new ApiError('bad_request', 'Enter a UPI ID to use UPI as the primary payout method.', { field: 'upiId' })
  }
  if (input.method === 'bank' && !(bankName && bankAcc && bankIfsc)) {
    throw new ApiError('bad_request', 'Enter full bank details to use bank transfer as the primary payout method.', { field: 'bankAccountNumber' })
  }
  return { upi_id: upi, bank_account_name: bankName, bank_account_number: bankAcc, bank_ifsc: bankIfsc, payout_method: input.method }
}
