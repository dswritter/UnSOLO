import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS } from '@/types'
import {
  badgeProgress, firstName, isSparseProfile, joinedLabel, mutualPlaces, profileCompleteness, profileTierProgress, visitedPlaces,
} from './publicProfileSummary'

const booking = (name: string, state: string) => ({ package: { destination: { name, state } } })

describe('profileTierProgress', () => {
  it('starts at Newcomer with progress to Explorer', () => {
    expect(profileTierProgress(0)).toMatchObject({ current: { name: 'Newcomer' }, next: { name: 'Explorer' }, percent: 0, pointsToNext: 50 })
  })
  it('computes progress within a tier', () => {
    const t = profileTierProgress(100)
    expect(t.current.name).toBe('Explorer')
    expect(t.next?.name).toBe('Adventurer')
    expect(t.percent).toBe(50)
    expect(t.pointsToNext).toBe(50)
  })
  it('caps at the top tier and clamps bad input', () => {
    expect(profileTierProgress(5000)).toMatchObject({ current: { name: 'Legend' }, next: null, percent: 100, pointsToNext: 0 })
    expect(profileTierProgress(-10).score).toBe(0)
    expect(profileTierProgress(Number.NaN).current.name).toBe('Newcomer')
  })
})

describe('profileCompleteness', () => {
  const empty = { avatar_url: null, bio: null, location: null, travel_style: null, instagram_url: null, website_url: null }
  it('reports nothing done for an empty profile', () => {
    expect(profileCompleteness(empty)).toMatchObject({ done: 0, total: 5, percent: 0 })
  })
  it('ignores whitespace-only fields and counts either social link', () => {
    const r = profileCompleteness({ ...empty, bio: '  ', avatar_url: 'x', website_url: 'https://a.b', travel_style: ['solo'] })
    expect(r.steps.filter(s => s.done).map(s => s.key)).toEqual(['photo', 'style', 'social'])
    expect(r.percent).toBe(60)
  })
})

describe('visitedPlaces / mutualPlaces', () => {
  it('dedupes states and places and skips missing destinations', () => {
    const r = visitedPlaces([booking('Manali', 'Himachal Pradesh'), booking('Kasol', 'Himachal Pradesh'), { package: null }, booking('Manali', 'Himachal Pradesh')])
    expect(r.states).toEqual(['Himachal Pradesh'])
    expect(r.places).toEqual(['Manali, Himachal Pradesh', 'Kasol, Himachal Pradesh'])
  })
  it('finds shared places', () => {
    expect(mutualPlaces([booking('Goa', 'Goa'), booking('Leh', 'Ladakh')], [booking('Leh', 'Ladakh')])).toEqual(['Leh, Ladakh'])
    expect(mutualPlaces([booking('Goa', 'Goa')], [])).toEqual([])
  })
})

describe('badgeProgress', () => {
  it('splits earned and locked and limits next-up', () => {
    const r = badgeProgress([ACHIEVEMENTS[1].key])
    expect(r.earned.map(a => a.key)).toEqual([ACHIEVEMENTS[1].key])
    expect(r.locked).toHaveLength(ACHIEVEMENTS.length - 1)
    expect(r.nextUp).toHaveLength(3)
    expect(r.total).toBe(ACHIEVEMENTS.length)
  })
  it('ignores unknown keys', () => {
    expect(badgeProgress(['nope']).earned).toEqual([])
  })
})

describe('isSparseProfile', () => {
  const zero = { trips: 0, states: 0, reviews: 0, score: 0, listings: 0 }
  it('is sparse only when everything is zero', () => {
    expect(isSparseProfile(zero)).toBe(true)
    expect(isSparseProfile({ ...zero, listings: 1 })).toBe(false)
    expect(isSparseProfile({ ...zero, score: 5 })).toBe(false)
  })
})

describe('joinedLabel / firstName', () => {
  it('formats join month and handles bad input', () => {
    expect(joinedLabel('2025-10-15T10:00:00Z')).toBe('Joined Oct 2025')
    expect(joinedLabel(null)).toBeNull()
    expect(joinedLabel('garbage')).toBeNull()
  })
  it('uses the first word of the name or falls back to username', () => {
    expect(firstName('  Priya Sharma ', 'priya')).toBe('Priya')
    expect(firstName(null, 'traveller42')).toBe('traveller42')
    expect(firstName('   ', 'x')).toBe('x')
  })
})
