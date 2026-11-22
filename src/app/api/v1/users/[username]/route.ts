import { z } from 'zod'
import { getApiContext } from '@/lib/api/context'
import { ok, parseWith, route } from '@/lib/api/http'
import { loadAppProfile } from '@/lib/profile/appProfile'

type Ctx = { params: Promise<{ username: string }> }

/** A traveller's profile: everything the web profile shows (see loadAppProfile). */
export const GET = route(async (req: Request, { params }: Ctx) => {
  const username = parseWith(z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/), (await params).username)
  const ctx = await getApiContext(req)
  return ok(await loadAppProfile(ctx, username), { cache: ctx.user ? 'private' : 'public', req })
})
