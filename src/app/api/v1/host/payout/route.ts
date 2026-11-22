import { z } from 'zod'
import { getApiContext } from '@/lib/api/context'
import { ok, parseJson, route } from '@/lib/api/http'
import { resolvePayoutUpdate } from '@/lib/host/payout'
import { PAYOUT_COLUMNS, requireHost } from '@/lib/host/server'
import { toPayout, type PayoutRow } from '@/lib/host/shape'

const field = z.string().max(300).nullish()
const Body = z.object({
  method: z.enum(['upi', 'bank']),
  upiId: field,
  bankAccountName: field,
  bankAccountNumber: field,
  bankIfsc: field,
})

/** GET /host/payout: where your earnings are paid (account number masked to the last 4 digits). */
export const GET = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = await requireHost(ctx)
  const { data, error } = await ctx.db.from('profiles').select(PAYOUT_COLUMNS).eq('id', user.id).single()
  if (error) throw error
  return ok(toPayout(data as PayoutRow))
})

/** PUT /host/payout: same rules as the web `updatePayoutDetails`. An omitted account number keeps the saved one. */
export const PUT = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = await requireHost(ctx)
  const b = await parseJson(req, Body)
  const { data: saved, error } = await ctx.db.from('profiles').select(PAYOUT_COLUMNS).eq('id', user.id).single()
  if (error) throw error
  const update = resolvePayoutUpdate(b, saved as PayoutRow)
  const { data, error: updateError } = await ctx.db.from('profiles')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', user.id).select(PAYOUT_COLUMNS).single()
  if (updateError) throw updateError
  return ok(toPayout(data as PayoutRow))
})
