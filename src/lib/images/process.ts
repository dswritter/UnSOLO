import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import { UPLOAD_WEBP_FULL_MAX_WIDTH, UPLOAD_WEBP_THUMB_MAX_WIDTH } from '@/lib/constants'

export type StoredImage = { url: string; thumbUrl: string; lqip: string; width: number | null; height: number | null; bytes: number }

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif', 'heif'])

/**
 * Validates by content (magic bytes via sharp, not the client's MIME type), auto-rotates,
 * strips metadata (incl. GPS), and stores full (≤1920px WebP), thumb (320px) and returns a
 * tiny base64 LQIP for progressive low→high loading on every platform.
 */
export async function processAndStoreImage(svc: SupabaseClient, input: Buffer, folder: string, ownerId: string): Promise<StoredImage> {
  const meta = await sharp(input, { failOn: 'error' }).metadata()
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw new Error('unsupported_format')
  if ((meta.width ?? 0) * (meta.height ?? 0) > 60_000_000) throw new Error('too_many_pixels')

  const base = sharp(input, { failOn: 'error' }).rotate()
  const [full, thumb, tiny] = await Promise.all([
    base.clone().resize({ width: UPLOAD_WEBP_FULL_MAX_WIDTH, height: UPLOAD_WEBP_FULL_MAX_WIDTH, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 84, effort: 4 }).toBuffer({ resolveWithObject: true }),
    base.clone().resize({ width: UPLOAD_WEBP_THUMB_MAX_WIDTH, height: UPLOAD_WEBP_THUMB_MAX_WIDTH, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 }).toBuffer(),
    base.clone().resize({ width: 16, height: 16, fit: 'inside' }).webp({ quality: 40 }).toBuffer(),
  ])
  const key = `${folder}/${ownerId}-${randomUUID()}`
  const bucket = svc.storage.from('images')
  const up1 = await bucket.upload(`${key}.webp`, full.data, { contentType: 'image/webp', cacheControl: '31536000', upsert: false })
  if (up1.error) throw up1.error
  const up2 = await bucket.upload(`${key}_thumb.webp`, thumb, { contentType: 'image/webp', cacheControl: '31536000', upsert: false })
  if (up2.error) {
    await bucket.remove([`${key}.webp`]).catch(() => undefined)
    throw up2.error
  }
  return {
    url: bucket.getPublicUrl(`${key}.webp`).data.publicUrl,
    thumbUrl: bucket.getPublicUrl(`${key}_thumb.webp`).data.publicUrl,
    lqip: `data:image/webp;base64,${tiny.toString('base64')}`,
    width: full.info.width ?? null,
    height: full.info.height ?? null,
    bytes: full.info.size,
  }
}
