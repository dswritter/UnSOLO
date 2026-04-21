/**
 * RazorpayX payout client.
 *
 * Uses the same RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET as the payments side
 * (RazorpayX is gated per-account by Razorpay). The X-specific config is:
 *   RAZORPAYX_ACCOUNT_NUMBER — your RazorpayX current account virtual number.
 *   RAZORPAY_WEBHOOK_SECRET  — shared secret for verifying X webhook signatures.
 *
 * If RAZORPAYX_ACCOUNT_NUMBER is not set, the caller should fall back to
 * a manual mark-paid flow.
 */

const BASE = 'https://api.razorpay.com/v1'

function authHeader(): string {
  const id = process.env.RAZORPAY_KEY_ID
  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!id || !secret) throw new Error('Razorpay API credentials missing')
  return 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64')
}

async function rpx<T>(path: string, init: RequestInit & { body?: string }): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  })
  const text = await res.text()
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Razorpay API non-JSON response (${res.status}): ${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    const err = json as { error?: { description?: string; code?: string } }
    throw new Error(
      `Razorpay API ${res.status}: ${err.error?.code || ''} ${err.error?.description || text}`,
    )
  }
  return json as T
}

export type RzpContact = { id: string; name: string; email?: string; contact?: string }
export type RzpFundAccount = { id: string; account_type: 'vpa' | 'bank_account'; active: boolean }
export type RzpPayout = {
  id: string
  status: 'queued' | 'pending' | 'processing' | 'processed' | 'failed' | 'cancelled' | 'reversed'
  failure_reason?: string | null
  utr?: string | null
  amount: number
}

export async function createContact(input: {
  name: string
  email?: string
  contact?: string
  reference_id?: string
}): Promise<RzpContact> {
  return rpx<RzpContact>('/contacts', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      contact: input.contact,
      type: 'vendor',
      reference_id: input.reference_id,
    }),
  })
}

export async function createUpiFundAccount(contactId: string, vpa: string): Promise<RzpFundAccount> {
  return rpx<RzpFundAccount>('/fund_accounts', {
    method: 'POST',
    body: JSON.stringify({
      contact_id: contactId,
      account_type: 'vpa',
      vpa: { address: vpa },
    }),
  })
}

export async function createBankFundAccount(
  contactId: string,
  input: { name: string; ifsc: string; account_number: string },
): Promise<RzpFundAccount> {
  return rpx<RzpFundAccount>('/fund_accounts', {
    method: 'POST',
    body: JSON.stringify({
      contact_id: contactId,
      account_type: 'bank_account',
      bank_account: {
        name: input.name,
        ifsc: input.ifsc,
        account_number: input.account_number,
      },
    }),
  })
}

export async function createPayout(input: {
  account_number: string
  fund_account_id: string
  amount_paise: number
  mode: 'UPI' | 'IMPS' | 'NEFT' | 'RTGS'
  purpose?: string
  reference_id?: string
  narration?: string
}): Promise<RzpPayout> {
  return rpx<RzpPayout>('/payouts', {
    method: 'POST',
    body: JSON.stringify({
      account_number: input.account_number,
      fund_account_id: input.fund_account_id,
      amount: input.amount_paise,
      currency: 'INR',
      mode: input.mode,
      purpose: input.purpose || 'vendor advance',
      queue_if_low_balance: true,
      reference_id: input.reference_id,
      narration: (input.narration || 'UnSOLO host payout').slice(0, 30),
    }),
  })
}

export function isRazorpayXConfigured(): boolean {
  return !!(
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET &&
    process.env.RAZORPAYX_ACCOUNT_NUMBER
  )
}
