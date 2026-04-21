/**
 * Free Razorpay IFSC lookup: https://ifsc.razorpay.com/{IFSC}
 * No auth, no key required. Returns bank + branch details or 404.
 */
export type IfscDetails = {
  BANK: string
  IFSC: string
  BRANCH: string
  CITY?: string
  STATE?: string
  MICR?: string | null
  CONTACT?: string | null
  ADDRESS?: string
}

export async function lookupIfsc(ifsc: string): Promise<IfscDetails | null> {
  const code = ifsc.trim().toUpperCase()
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) return null
  try {
    const res = await fetch(`https://ifsc.razorpay.com/${code}`, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    return data as IfscDetails
  } catch {
    return null
  }
}

export const UPI_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/
export const ACCOUNT_RE = /^[0-9]{9,18}$/
