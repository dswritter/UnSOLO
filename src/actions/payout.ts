'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getActionAuth } from '@/lib/auth/action-auth'

export type PayoutDetails = {
  upi_id: string | null
  bank_account_name: string | null
  bank_account_number: string | null
  bank_ifsc: string | null
  payout_method: 'upi' | 'bank' | null
}

export async function getPayoutDetails(): Promise<PayoutDetails | { error: string }> {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('profiles')
    .select('upi_id, bank_account_name, bank_account_number, bank_ifsc, payout_method')
    .eq('id', user.id)
    .single()

  if (error) return { error: error.message }
  return data as PayoutDetails
}

export async function hasPayoutConfigured(userId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('upi_id, bank_account_number, bank_ifsc, payout_method')
    .eq('id', userId)
    .single()
  if (!data) return false
  const hasUpi = !!(data.upi_id && String(data.upi_id).includes('@'))
  const hasBank = !!(data.bank_account_number && data.bank_ifsc)
  return hasUpi || hasBank
}

const UPI_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/
const ACCOUNT_RE = /^[0-9]{9,18}$/

export async function updatePayoutDetails(input: {
  upi_id?: string | null
  bank_account_name?: string | null
  bank_account_number?: string | null
  bank_ifsc?: string | null
  payout_method: 'upi' | 'bank'
}) {
  const { supabase, user } = await getActionAuth()
  if (!user) return { error: 'Not authenticated' }

  const upi = (input.upi_id || '').trim().toLowerCase() || null
  const bankName = (input.bank_account_name || '').trim() || null
  const bankAcc = (input.bank_account_number || '').replace(/\s+/g, '') || null
  const bankIfsc = (input.bank_ifsc || '').trim().toUpperCase() || null

  if (upi && !UPI_RE.test(upi)) {
    return { error: 'Invalid UPI ID. Use the format name@bank (e.g. ravi@okaxis).' }
  }

  const hasAnyBankField = bankName || bankAcc || bankIfsc
  if (hasAnyBankField) {
    if (!bankName || bankName.length < 2) return { error: 'Enter the account holder name.' }
    if (!bankAcc || !ACCOUNT_RE.test(bankAcc)) return { error: 'Enter a valid account number (9–18 digits).' }
    if (!bankIfsc || !IFSC_RE.test(bankIfsc)) return { error: 'Enter a valid IFSC code (e.g. HDFC0001234).' }
  }

  if (input.payout_method === 'upi' && !upi) {
    return { error: 'Enter a UPI ID to use UPI as the primary payout method.' }
  }
  if (input.payout_method === 'bank' && !(bankName && bankAcc && bankIfsc)) {
    return { error: 'Enter full bank details to use bank transfer as the primary payout method.' }
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      upi_id: upi,
      bank_account_name: bankName,
      bank_account_number: bankAcc,
      bank_ifsc: bankIfsc,
      payout_method: input.payout_method,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) return { error: error.message }

  revalidatePath('/host/payout')
  revalidatePath('/host/verify')
  revalidatePath('/host')
  return { success: true }
}
