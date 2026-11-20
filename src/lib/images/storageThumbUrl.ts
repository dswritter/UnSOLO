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

/**
 * A small, fast version of `fullUrl` to paint while the full image loads, or null when there is
 * none: the `_thumb.webp` sibling for our uploads (320px), or a 320px Unsplash rendition.
 */
export function lowResImageUrl(fullUrl: string | null | undefined): string | null {
  if (!fullUrl) return null
  const thumb = storageThumbnailUrl(fullUrl)
  if (thumb && thumb !== fullUrl.trim()) return thumb
  try {
    const u = new URL(fullUrl)
    if (u.hostname === 'images.unsplash.com') {
      u.searchParams.set('w', '320')
      u.searchParams.set('q', '50')
      u.searchParams.set('auto', 'format')
      return u.toString() === fullUrl ? null : u.toString()
    }
  } catch { /* relative or invalid URL: no low-res version */ }
  return null
}
