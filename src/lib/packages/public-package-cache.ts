import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public-client'

export const PACKAGE_DETAIL_SELECT =
  '*, destination:destinations(*), host:profiles!packages_host_id_fkey(id, username, full_name, avatar_url, bio, phone_number, phone_public, is_host, host_rating, is_verified, total_hosted_trips)'

/** Public (active) trip detail, shared across viewers so the page skips a per-request DB round trip. */
export const getCachedPublicPackageDetail = unstable_cache(
  async (slug: string) => {
    const { data } = await createPublicClient()
      .from('packages')
      .select(PACKAGE_DETAIL_SELECT)
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle()
    if (!data) return null
    const pkg = { ...(data as Record<string, unknown>) }
    delete pkg.search_document
    return pkg
  },
  ['public-package-detail-v1'],
  { revalidate: 60, tags: ['explore-public-packages'] },
)
