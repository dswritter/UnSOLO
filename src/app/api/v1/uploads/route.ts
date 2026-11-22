import { getApiContext, requireUser } from '@/lib/api/context'
import { ApiError, ok, route } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rate-limit'
import { processAndStoreImage } from '@/lib/images/process'
import { UPLOAD_MAX_IMAGE_BYTES } from '@/lib/constants'

export const runtime = 'nodejs'

const FOLDERS = { post: 'tribe-posts', story: 'status-stories', avatar: 'avatars', host: 'host-trips', review: 'reviews' } as const

/**
 * Image upload for all clients. Clients compress to ≤ 2 MB / 2048 px first (see /config);
 * the server re-validates by content and stores WebP full + thumb + LQIP.
 */
export const POST = route(async (req: Request) => {
  const ctx = await getApiContext(req)
  const user = requireUser(ctx)
  await enforceRateLimit(ctx, 'upload')
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  const purpose = String(form?.get('purpose') ?? 'post') as keyof typeof FOLDERS
  if (!(file instanceof File)) throw new ApiError('bad_request', 'Attach an image as "file"', { field: 'file' })
  if (!(purpose in FOLDERS)) throw new ApiError('bad_request', 'Unknown purpose', { field: 'purpose' })
  if (file.size > UPLOAD_MAX_IMAGE_BYTES) throw new ApiError('bad_request', 'Image is too large. Please choose one under 5 MB.', { field: 'file' })
  if (purpose === 'host') {
    const { data: p } = await ctx.db.from('profiles').select('is_host, role').eq('id', user.id).single()
    if (!p?.is_host && p?.role !== 'admin') throw new ApiError('forbidden', 'Host verification required')
  }
  try {
    const stored = await processAndStoreImage(ctx.service(), Buffer.from(await file.arrayBuffer()), FOLDERS[purpose], user.id)
    if (purpose === 'avatar') await ctx.db.from('profiles').update({ avatar_url: stored.url }).eq('id', user.id)
    return ok(stored, { status: 201 })
  } catch (e) {
    const m = (e as Error).message
    if (m === 'unsupported_format' || m === 'too_many_pixels' || /Input buffer|unsupported image/i.test(m)) {
      throw new ApiError('bad_request', 'Use a JPEG, PNG, WebP or AVIF photo', { field: 'file' })
    }
    throw e
  }
})
