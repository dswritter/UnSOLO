import { NextResponse } from 'next/server'
import { lookupIfsc } from '@/lib/razorpay/validation'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code') || ''
  const details = await lookupIfsc(code)
  if (!details) return NextResponse.json({ error: 'Invalid IFSC' }, { status: 404 })
  return NextResponse.json({
    bank: details.BANK,
    branch: details.BRANCH,
    city: details.CITY,
    state: details.STATE,
    ifsc: details.IFSC,
  })
}
