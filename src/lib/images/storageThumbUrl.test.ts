import { describe, expect, it } from 'vitest'
import { lowResImageUrl, storageThumbnailUrl } from './storageThumbUrl'

const full = 'https://abc.supabase.co/storage/v1/object/public/images/packages/u-1.webp'

describe('lowResImageUrl', () => {
  it('uses the stored _thumb.webp sibling for our uploads', () => {
    expect(lowResImageUrl(full)).toBe('https://abc.supabase.co/storage/v1/object/public/images/packages/u-1_thumb.webp')
    expect(storageThumbnailUrl(full)).toBe(lowResImageUrl(full))
  })
  it('has nothing smaller to show for a thumb, a legacy JPEG or a local file', () => {
    expect(lowResImageUrl(full.replace('.webp', '_thumb.webp'))).toBeNull()
    expect(lowResImageUrl('https://abc.supabase.co/storage/v1/object/public/images/a.jpg')).toBeNull()
    expect(lowResImageUrl('/dev/img/a.jpg')).toBeNull()
    expect(lowResImageUrl(null)).toBeNull()
  })
  it('asks Unsplash for a 320px rendition', () => {
    const low = lowResImageUrl('https://images.unsplash.com/photo-1?w=1600&q=80')!
    expect(new URL(low).searchParams.get('w')).toBe('320')
  })
})
