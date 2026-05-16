/**
 * Supabase Storage public URLs for the `images` bucket: `/api/upload` stores a
 * full-size WebP plus a `_thumb.webp` sibling. Use this helper in list UIs
 * so clients request the small object instead of the 1920px file.
 *
 * Legacy JPEG/PNG URLs and non-Supabase URLs are returned unchanged.
 */
const STORAGE_IMAGES_PUBLIC = '/storage/v1/object/public/images/'

export function storageThumbnailUrl(fullUrl: string | null | undefined): string {
  if (fullUrl == null || fullUrl === '') return ''
  const u = fullUrl.trim()
  if (u.startsWith('/') && !u.startsWith('//')) return u
  if (!u.includes(STORAGE_IMAGES_PUBLIC)) return u
  if (u.includes('_thumb.webp')) return u
  const q = u.indexOf('?')
  const base = q >= 0 ? u.slice(0, q) : u
  const tail = q >= 0 ? u.slice(q) : ''
  if (!base.endsWith('.webp')) return u
  const dot = base.lastIndexOf('.webp')
  if (dot < 0) return u
  return `${base.slice(0, dot)}_thumb.webp${tail}`
}
