import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * DEVELOPMENT-ONLY sample photos for local demo data (Explore, Tribe) when no database is connected.
 * Serves files from the local, uncommitted `.oil-ui/app-redesign/assets` folder. 404s in production.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (process.env.NODE_ENV === 'production') return new Response('Not found', { status: 404 })
  const rel = (await params).path.join('/')
  if (!/^(av\/)?[a-z0-9-]{1,40}\.jpg$/.test(rel)) return new Response('Not found', { status: 404 })
  try {
    const body = await readFile(join(process.cwd(), '.oil-ui/app-redesign/assets', rel))
    return new Response(new Uint8Array(body), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600' } })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
