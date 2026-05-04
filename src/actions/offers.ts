'use server'

import { revalidatePath } from 'next/cache'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getActionAuth } from '@/lib/auth/action-auth'

type OfferPageSectionRow = {
  id: string
  slug: string
  title: string
  subtitle: string | null
  source_type: 'manual_discounts' | 'auto_bundle'
  bundle_kind: 'trip_stay' | 'trip_activity' | 'trip_rental' | 'stay_activity' | 'stay_rental' | 'rental_activity' | null
  hero_badge: string | null
  is_active: boolean
  position_order: number
}

type DiscountOfferRow = {
  id: string
  name: string
  type: string
  discount_paise: number
  promo_code: string | null
  valid_until: string | null
  is_active: boolean
}

export type OfferComboCard = {
  id: string
  title: string
  subtitle: string
  primaryHref: string
  secondaryHref: string
  primaryLabel: string
  secondaryLabel: string
  primaryImage: string | null
  secondaryImage: string | null
}

export type PublicOfferSection = OfferPageSectionRow & {
  offers: DiscountOfferRow[]
  combos: OfferComboCard[]
}

type LinkedPackageRow = {
  id: string
  slug: string
  title: string
  images: string[] | null
  host_id: string | null
  is_active: boolean
}

type LinkedListingRow = {
  id: string
  slug: string
  title: string
  images: string[] | null
  host_id: string | null
  type: string
  status: string | null
  first_approved_at: string | null
  is_active: boolean
  location: string | null
}

async function requireAdmin() {
  const { supabase, user } = await getActionAuth()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') throw new Error('Unauthorized — admin only')
  return { supabase, user }
}

function isPublicServiceListingQuery() {
  return 'status.eq.approved,and(status.eq.pending,first_approved_at.not.is.null)'
}

async function getAutoBundleCombos(bundleKind: NonNullable<OfferPageSectionRow['bundle_kind']>): Promise<OfferComboCard[]> {
  const svc = createServiceRoleClient()

  if (bundleKind === 'trip_stay' || bundleKind === 'trip_activity' || bundleKind === 'trip_rental') {
    const listingType = bundleKind === 'trip_stay' ? 'stays' : bundleKind === 'trip_activity' ? 'activities' : 'rentals'
    const { data: links } = await svc
      .from('service_listing_package_links')
      .select(`
        id,
        package:packages(id, slug, title, images, host_id, is_active),
        listing:service_listings(id, slug, title, images, host_id, type, status, first_approved_at, is_active, location)
      `)
      .order('position_order', { ascending: true })
      .limit(18)

    const rows = (links || []).map(link => {
      const row = link as {
        id: string
        package: LinkedPackageRow[] | LinkedPackageRow | null
        listing: LinkedListingRow[] | LinkedListingRow | null
      }

      return {
        id: row.id,
        package: Array.isArray(row.package) ? (row.package[0] ?? null) : row.package,
        listing: Array.isArray(row.listing) ? (row.listing[0] ?? null) : row.listing,
      }
    })

    return rows
      .filter(r =>
        r.package?.is_active &&
        r.listing?.is_active &&
        r.listing.type === listingType &&
        (r.listing.status === 'approved' || (r.listing.status === 'pending' && r.listing.first_approved_at)) &&
        r.package.host_id &&
        r.listing.host_id &&
        r.package.host_id === r.listing.host_id,
      )
      .slice(0, 8)
      .map(r => ({
        id: r.id,
        title: `${r.package!.title} + ${r.listing!.title}`,
        subtitle: r.listing!.location || 'Host-linked travel combo',
        primaryHref: `/packages/${r.package!.slug}`,
        secondaryHref: `/listings/${r.listing!.type}/${r.listing!.slug}`,
        primaryLabel: r.package!.title,
        secondaryLabel: r.listing!.title,
        primaryImage: r.package!.images?.[0] || null,
        secondaryImage: r.listing!.images?.[0] || null,
      }))
  }

  const [leftType, rightType] =
    bundleKind === 'stay_activity'
      ? ['stays', 'activities']
      : bundleKind === 'stay_rental'
        ? ['stays', 'rentals']
        : ['rentals', 'activities']

  const { data: leftListings } = await svc
    .from('service_listings')
    .select('id, slug, title, images, host_id, type, destination_id, location')
    .eq('type', leftType)
    .eq('is_active', true)
    .or(isPublicServiceListingQuery())
    .limit(18)

  const { data: rightListings } = await svc
    .from('service_listings')
    .select('id, slug, title, images, host_id, type, destination_id, location')
    .eq('type', rightType)
    .eq('is_active', true)
    .or(isPublicServiceListingQuery())
    .limit(40)

  const rights = (rightListings || []) as Array<{ id: string; slug: string; title: string; images: string[] | null; host_id: string | null; type: string; destination_id: string | null; location: string | null }>

  const combos: OfferComboCard[] = []
  for (const left of (leftListings || []) as Array<{ id: string; slug: string; title: string; images: string[] | null; host_id: string | null; type: string; destination_id: string | null; location: string | null }>) {
    const match = rights.find(r =>
      r.host_id &&
      left.host_id &&
      r.host_id === left.host_id &&
      r.destination_id &&
      left.destination_id &&
      r.destination_id === left.destination_id,
    )
    if (!match) continue
    combos.push({
      id: `${left.id}:${match.id}`,
      title: `${left.title} + ${match.title}`,
      subtitle: left.location || match.location || 'Host-linked combo',
      primaryHref: `/listings/${left.type}/${left.slug}`,
      secondaryHref: `/listings/${match.type}/${match.slug}`,
      primaryLabel: left.title,
      secondaryLabel: match.title,
      primaryImage: left.images?.[0] || null,
      secondaryImage: match.images?.[0] || null,
    })
    if (combos.length >= 8) break
  }

  return combos
}

export async function getPublicOfferSections(): Promise<PublicOfferSection[]> {
  const supabase = await createClient()

  const { data: sections } = await supabase
    .from('offer_page_sections')
    .select('*')
    .eq('is_active', true)
    .order('position_order', { ascending: true })
    .order('created_at', { ascending: true })

  const rows = (sections || []) as OfferPageSectionRow[]
  if (rows.length === 0) return []

  const manualSectionIds = rows.filter(s => s.source_type === 'manual_discounts').map(s => s.id)
  const { data: sectionItems } = manualSectionIds.length
    ? await supabase
        .from('offer_page_section_items')
        .select('section_id, position_order, offer:discount_offers(id, name, type, discount_paise, promo_code, valid_until, is_active)')
        .in('section_id', manualSectionIds)
        .order('position_order', { ascending: true })
    : { data: [] }

  const offersBySection = new Map<string, DiscountOfferRow[]>()
  for (const rawRow of (sectionItems || []) as Array<{ section_id: string; offer: DiscountOfferRow[] | DiscountOfferRow | null }>) {
    const offer = Array.isArray(rawRow.offer) ? (rawRow.offer[0] ?? null) : rawRow.offer
    if (!offer || !offer.is_active) continue
    const list = offersBySection.get(rawRow.section_id) || []
    list.push(offer)
    offersBySection.set(rawRow.section_id, list)
  }

  const out: PublicOfferSection[] = []
  for (const section of rows) {
    out.push({
      ...section,
      offers: section.source_type === 'manual_discounts' ? (offersBySection.get(section.id) || []) : [],
      combos: section.source_type === 'auto_bundle' && section.bundle_kind ? await getAutoBundleCombos(section.bundle_kind) : [],
    })
  }

  return out
}

export async function getOfferAdminSnapshot() {
  await requireAdmin()
  const svc = createServiceRoleClient()

  const [{ data: sections }, { data: offers }] = await Promise.all([
    svc.from('offer_page_sections').select('*').order('position_order', { ascending: true }).order('created_at', { ascending: true }),
    svc.from('discount_offers').select('*').order('created_at', { ascending: false }),
  ])

  const sectionRows = (sections || []) as OfferPageSectionRow[]
  const offerRows = (offers || []) as DiscountOfferRow[]
  const manualIds = sectionRows.filter(s => s.source_type === 'manual_discounts').map(s => s.id)

  const { data: items } = manualIds.length
    ? await svc
        .from('offer_page_section_items')
        .select('section_id, discount_offer_id, position_order')
        .in('section_id', manualIds)
        .order('position_order', { ascending: true })
    : { data: [] }

  return {
    sections: sectionRows,
    offers: offerRows,
    sectionItems: (items || []) as Array<{ section_id: string; discount_offer_id: string; position_order: number }>,
  }
}

export async function createOfferPageSection(input: {
  title: string
  subtitle?: string
  slug: string
  sourceType: OfferPageSectionRow['source_type']
  bundleKind?: OfferPageSectionRow['bundle_kind']
  heroBadge?: string
}) {
  await requireAdmin()
  const svc = createServiceRoleClient()

  const { data: last } = await svc
    .from('offer_page_sections')
    .select('position_order')
    .order('position_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await svc.from('offer_page_sections').insert({
    slug: input.slug,
    title: input.title,
    subtitle: input.subtitle || null,
    source_type: input.sourceType,
    bundle_kind: input.sourceType === 'auto_bundle' ? input.bundleKind || null : null,
    hero_badge: input.heroBadge || null,
    position_order: (last?.position_order || 0) + 10,
  })

  if (error) return { error: error.message }
  revalidatePath('/offers')
  revalidatePath('/admin/offers')
  return { success: true as const }
}

export async function moveOfferPageSection(sectionId: string, direction: 'up' | 'down') {
  await requireAdmin()
  const svc = createServiceRoleClient()

  const { data: sections } = await svc
    .from('offer_page_sections')
    .select('id, position_order')
    .order('position_order', { ascending: true })
    .order('created_at', { ascending: true })

  const rows = (sections || []) as Array<{ id: string; position_order: number }>
  const idx = rows.findIndex(r => r.id === sectionId)
  if (idx === -1) return { error: 'Section not found' }
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= rows.length) return { success: true as const }

  const current = rows[idx]!
  const target = rows[swapIdx]!

  await svc.from('offer_page_sections').update({ position_order: target.position_order }).eq('id', current.id)
  await svc.from('offer_page_sections').update({ position_order: current.position_order }).eq('id', target.id)

  revalidatePath('/offers')
  revalidatePath('/admin/offers')
  return { success: true as const }
}

export async function toggleOfferPageSection(sectionId: string, isActive: boolean) {
  await requireAdmin()
  const svc = createServiceRoleClient()
  const { error } = await svc.from('offer_page_sections').update({ is_active: isActive }).eq('id', sectionId)
  if (error) return { error: error.message }
  revalidatePath('/offers')
  revalidatePath('/admin/offers')
  return { success: true as const }
}

export async function updateOfferPageSectionDiscounts(sectionId: string, offerIds: string[]) {
  await requireAdmin()
  const svc = createServiceRoleClient()

  await svc.from('offer_page_section_items').delete().eq('section_id', sectionId)
  if (offerIds.length > 0) {
    await svc.from('offer_page_section_items').insert(
      offerIds.map((offerId, idx) => ({
        section_id: sectionId,
        discount_offer_id: offerId,
        position_order: (idx + 1) * 10,
      })),
    )
  }

  revalidatePath('/offers')
  revalidatePath('/admin/offers')
  return { success: true as const }
}
