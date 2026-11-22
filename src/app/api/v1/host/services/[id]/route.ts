import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, ok, parseJson, parseWith, route, uuid } from '@/lib/api/http'
import { SERVICE_LISTINGS_TAG } from '@/lib/cache-tags'
import { loadHostServices } from '@/lib/host/server'

type Ctx = { params: Promise<{ id: string }> }

const Body = z.object({ isActive: z.boolean() })

/** PATCH /host/services/{id}: turn your stay, activity or rental on or off (primary host only). */
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const id = parseWith(uuid, (await params).id)
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  const { isActive } = await parseJson(req, Body)
  const { data: listing, error } = await ctx.db.from('service_listings').select('id, host_id, archived_at').eq('id', id).maybeSingle()
  if (error) throw error
  if (!listing || listing.host_id !== user.id || listing.archived_at) throw new ApiError('not_found', 'Listing not found')
  const { error: updateError } = await ctx.db.from('service_listings').update({ is_active: isActive }).eq('id', id).eq('host_id', user.id)
  if (updateError) throw updateError
  revalidateTag(SERVICE_LISTINGS_TAG, 'max')
  const { services } = await loadHostServices(ctx, user.id, { ids: [id] })
  if (!services[0]) throw new ApiError('not_found', 'Listing not found')
  return ok(services[0])
})
