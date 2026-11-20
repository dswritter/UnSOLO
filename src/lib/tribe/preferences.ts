import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

export type Preferences = {
  landingTab: 'explore' | 'tribe' | 'trips'
  notify: {
    push: Record<NotifyCategory, boolean>
    email: Record<NotifyCategory, boolean>
    quietHours: { from: string; to: string }
  }
  interests: string[]
  suggestByLocation: boolean
  suggestByGender: boolean
  shareLocation: boolean
  dataSaver: boolean
}
export type NotifyCategory = 'plans' | 'replies' | 'messages' | 'trips' | 'tags' | 'marketing'

export const INTERESTS = ['trek', 'beach', 'mountains', 'spiritual', 'roadtrip', 'food', 'wildlife', 'culture', 'nightlife', 'budget', 'luxury', 'photography'] as const

export const DEFAULT_PREFERENCES: Preferences = {
  landingTab: 'explore',
  notify: {
    push: { plans: true, replies: true, messages: true, trips: true, tags: true, marketing: false },
    email: { plans: true, replies: false, messages: false, trips: true, tags: true, marketing: false },
    quietHours: { from: '22:00', to: '07:00' },
  },
  interests: [],
  suggestByLocation: true,
  suggestByGender: false,
  shareLocation: false,
  dataSaver: false,
}

const cat = z.object({
  plans: z.boolean(), replies: z.boolean(), messages: z.boolean(), trips: z.boolean(), tags: z.boolean(), marketing: z.boolean(),
}).partial()
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

export const PreferencesPatch = z.object({
  landingTab: z.enum(['explore', 'tribe', 'trips']),
  notify: z.object({ push: cat, email: cat, quietHours: z.object({ from: hhmm, to: hhmm }) }).partial(),
  interests: z.array(z.enum(INTERESTS)).max(12),
  suggestByLocation: z.boolean(),
  suggestByGender: z.boolean(),
  shareLocation: z.boolean(),
  dataSaver: z.boolean(),
}).partial().strict()

type Row = Record<string, unknown>

export function rowToPreferences(r: Row | null | undefined): Preferences {
  if (!r) return DEFAULT_PREFERENCES
  const n = (r.notify as Row | null) ?? {}
  const qh = (n.quiet_hours ?? n.quietHours) as { from?: string; to?: string } | undefined
  return {
    landingTab: (r.landing_tab as Preferences['landingTab']) ?? 'explore',
    notify: {
      push: { ...DEFAULT_PREFERENCES.notify.push, ...((n.push as Row) ?? {}) } as Preferences['notify']['push'],
      email: { ...DEFAULT_PREFERENCES.notify.email, ...((n.email as Row) ?? {}) } as Preferences['notify']['email'],
      quietHours: { from: qh?.from ?? '22:00', to: qh?.to ?? '07:00' },
    },
    interests: Array.isArray(r.interests) ? (r.interests as string[]) : [],
    suggestByLocation: r.suggest_by_location !== false,
    suggestByGender: r.suggest_by_gender === true,
    shareLocation: r.share_location === true,
    dataSaver: r.data_saver === true,
  }
}

export async function loadPreferences(db: SupabaseClient, userId: string): Promise<Preferences> {
  const { data } = await db.from('user_preferences').select('*').eq('user_id', userId).maybeSingle()
  return rowToPreferences(data as Row | null)
}

export async function savePreferences(db: SupabaseClient, userId: string, patch: z.infer<typeof PreferencesPatch>): Promise<Preferences> {
  const cur = await loadPreferences(db, userId)
  const next: Preferences = {
    ...cur,
    ...patch,
    notify: {
      push: { ...cur.notify.push, ...(patch.notify?.push ?? {}) },
      email: { ...cur.notify.email, ...(patch.notify?.email ?? {}) },
      quietHours: patch.notify?.quietHours ?? cur.notify.quietHours,
    },
  }
  const { error } = await db.from('user_preferences').upsert({
    user_id: userId,
    landing_tab: next.landingTab,
    notify: { push: next.notify.push, email: next.notify.email, quiet_hours: next.notify.quietHours },
    interests: next.interests,
    suggest_by_location: next.suggestByLocation,
    suggest_by_gender: next.suggestByGender,
    share_location: next.shareLocation,
    data_saver: next.dataSaver,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
  if (error) throw error
  if (patch.shareLocation === false) {
    // Consent withdrawn: forget the approximate home location (city name stays, it's user-typed).
    await db.from('profile_private').update({ home_lat: null, home_lng: null }).eq('user_id', userId)
  }
  return next
}

/** Quiet hours in Asia/Kolkata; categories 'messages' and 'trips' are allowed through. */
export function isQuietNow(p: Preferences, category: string, now = new Date()): boolean {
  if (category === 'messages' || category === 'trips') return false
  const ist = new Date(now.getTime() + 5.5 * 3600_000)
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))
  const from = toMin(p.notify.quietHours.from), to = toMin(p.notify.quietHours.to)
  return from <= to ? mins >= from && mins < to : mins >= from || mins < to
}
