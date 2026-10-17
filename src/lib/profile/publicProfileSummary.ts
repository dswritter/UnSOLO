import { ACHIEVEMENTS, type Achievement } from '@/types'

export type ProfileTier = { name: string; minScore: number; tone: string }

export const PROFILE_TIERS: readonly ProfileTier[] = [
  { name: 'Newcomer', minScore: 0, tone: 'text-muted-foreground' },
  { name: 'Explorer', minScore: 50, tone: 'text-emerald-600 dark:text-emerald-400' },
  { name: 'Adventurer', minScore: 150, tone: 'text-sky-600 dark:text-sky-400' },
  { name: 'Voyager', minScore: 300, tone: 'text-violet-600 dark:text-violet-400' },
  { name: 'Trailblazer', minScore: 500, tone: 'text-orange-600 dark:text-orange-400' },
  { name: 'Legend', minScore: 1000, tone: 'text-primary' },
]

export function profileTierProgress(score: number) {
  const safe = Math.max(0, Math.floor(score || 0))
  const current = [...PROFILE_TIERS].reverse().find(t => safe >= t.minScore) ?? PROFILE_TIERS[0]
  const next = PROFILE_TIERS.find(t => t.minScore > safe) ?? null
  const percent = next ? Math.round(((safe - current.minScore) / (next.minScore - current.minScore)) * 100) : 100
  return { score: safe, current, next, percent, pointsToNext: next ? next.minScore - safe : 0 }
}

export type CompletenessInput = {
  avatar_url: string | null
  bio: string | null
  location: string | null
  travel_style: string[] | null
  instagram_url: string | null
  website_url: string | null
}

export type CompletenessStep = { key: string; label: string; done: boolean }

export function profileCompleteness(p: CompletenessInput) {
  const steps: CompletenessStep[] = [
    { key: 'photo', label: 'Add a profile photo', done: Boolean(p.avatar_url) },
    { key: 'bio', label: 'Write a short bio', done: Boolean(p.bio?.trim()) },
    { key: 'location', label: 'Add your home city', done: Boolean(p.location?.trim()) },
    { key: 'style', label: 'Pick your travel style', done: (p.travel_style?.length ?? 0) > 0 },
    { key: 'social', label: 'Link Instagram or a website', done: Boolean(p.instagram_url || p.website_url) },
  ]
  const done = steps.filter(s => s.done).length
  return { steps, done, total: steps.length, percent: Math.round((done / steps.length) * 100) }
}

type BookingPlace = { package?: { destination?: { name?: string | null; state?: string | null } | null } | null }

export function visitedPlaces(bookings: readonly BookingPlace[]) {
  const states = new Set<string>()
  const places = new Set<string>()
  for (const b of bookings) {
    const dest = b.package?.destination
    if (dest?.state) states.add(dest.state)
    if (dest?.name && dest?.state) places.add(`${dest.name}, ${dest.state}`)
  }
  return { states: [...states], places: [...places] }
}

export function mutualPlaces(theirs: readonly BookingPlace[], mine: readonly BookingPlace[]) {
  const own = new Set(visitedPlaces(mine).places)
  return visitedPlaces(theirs).places.filter(p => own.has(p))
}

export function badgeProgress(earnedKeys: Iterable<string>, catalogue: readonly Achievement[] = ACHIEVEMENTS, upcoming = 3) {
  const earnedSet = new Set(earnedKeys)
  const earned = catalogue.filter(a => earnedSet.has(a.key))
  const locked = catalogue.filter(a => !earnedSet.has(a.key))
  return { earned, locked, nextUp: locked.slice(0, upcoming), total: catalogue.length }
}

export type ProfileActivityCounts = { trips: number; states: number; reviews: number; score: number; listings: number }

/** True when the profile has nothing worth a stats row; show a welcome panel instead of zeros. */
export function isSparseProfile(c: ProfileActivityCounts) {
  return c.trips === 0 && c.states === 0 && c.reviews === 0 && c.score === 0 && c.listings === 0
}

export function joinedLabel(createdAt: string | null | undefined) {
  if (!createdAt) return null
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return null
  return `Joined ${d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}`
}

export function firstName(fullName: string | null | undefined, username: string) {
  return fullName?.trim().split(/\s+/)[0] || username
}
