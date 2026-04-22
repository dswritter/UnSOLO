'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logAuditEvent } from '@/actions/admin'
import { DEFAULT_SUPPORT_WHATSAPP_NUMBER } from '@/lib/platform-settings'
import { revalidatePath } from 'next/cache'

async function requireAdmin(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'super_admin') {
    throw new Error('Admin access required')
  }
  return user.id
}

function normalise(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 0) return null
  if (digits.length < 10) throw new Error('WhatsApp number must have at least 10 digits')
  return digits
}

export type WhatsappListingRow = {
  id: string
  title: string
  whatsapp_number: string | null
  is_active?: boolean | null
  status?: string | null
}

export type WhatsappAdminData = {
  platformDefault: string
  packages: WhatsappListingRow[]
  serviceListings: Record<'stays' | 'activities' | 'rentals' | 'getting_around', WhatsappListingRow[]>
}

export async function getWhatsappAdminData(): Promise<WhatsappAdminData | { error: string }> {
  try {
    await requireAdmin()
    const svc = await createServiceClient()

    const [settingRes, pkgRes, svcRes] = await Promise.all([
      svc.from('platform_settings').select('value').eq('key', 'support_whatsapp_number').maybeSingle(),
      svc.from('packages').select('id, title, whatsapp_number, is_active').order('created_at', { ascending: false }),
      svc.from('service_listings').select('id, title, type, whatsapp_number, status, is_active').order('created_at', { ascending: false }),
    ])

    const rawDefault = (settingRes.data?.value as string | undefined) ?? ''
    const platformDefault = normaliseReadOnly(rawDefault) ?? DEFAULT_SUPPORT_WHATSAPP_NUMBER

    const grouped: WhatsappAdminData['serviceListings'] = {
      stays: [], activities: [], rentals: [], getting_around: [],
    }
    for (const row of (svcRes.data || []) as Array<WhatsappListingRow & { type: keyof typeof grouped }>) {
      if (row.type in grouped) {
        grouped[row.type].push({
          id: row.id,
          title: row.title,
          whatsapp_number: row.whatsapp_number,
          is_active: row.is_active,
          status: row.status,
        })
      }
    }

    return {
      platformDefault,
      packages: (pkgRes.data || []) as WhatsappListingRow[],
      serviceListings: grouped,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to load WhatsApp admin data' }
  }
}

function normaliseReadOnly(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 10 ? digits : null
}

export async function updatePackageWhatsapp(packageId: string, rawValue: string) {
  try {
    const userId = await requireAdmin()
    const value = normalise(rawValue)
    const svc = await createServiceClient()
    const { error } = await svc.from('packages').update({ whatsapp_number: value }).eq('id', packageId)
    if (error) return { error: error.message }

    await logAuditEvent(userId, 'update_package_whatsapp', 'package', packageId, { whatsapp_number: value })
    revalidatePath('/admin/whatsapp')
    return { success: true, value }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Update failed' }
  }
}

export async function updateServiceListingWhatsapp(listingId: string, rawValue: string) {
  try {
    const userId = await requireAdmin()
    const value = normalise(rawValue)
    const svc = await createServiceClient()
    const { error } = await svc.from('service_listings').update({ whatsapp_number: value }).eq('id', listingId)
    if (error) return { error: error.message }

    await logAuditEvent(userId, 'update_service_listing_whatsapp', 'service_listing', listingId, { whatsapp_number: value })
    revalidatePath('/admin/whatsapp')
    return { success: true, value }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Update failed' }
  }
}
