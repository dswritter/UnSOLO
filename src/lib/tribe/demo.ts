/**
 * Sample Tribe content for LOCAL preview only (never production): used when the Tribe
 * migrations (119–121) are not applied to the connected database yet, or TRIBE_DEMO=1.
 * Mirrors the Android/iOS demo fixtures so screenshots line up across platforms.
 */
import type { Comment, Media, Post, Seat, TripLite, UserLite } from './models'
import { DEMO_TRIPS } from './demo-trips'

const u = (id: string, username: string, name: string, extra: Partial<UserLite> = {}): UserLite => ({
  id, username, name, avatarUrl: null, isPhoneVerified: true, isIdVerified: false, isHost: false, ...extra,
})
/** Dev-only sample photos (served by /dev/img in development). */
const av = (n: number) => `/dev/img/av/a${n}.jpg`
const photo = (name: string): Media => ({ url: `/dev/img/${name}`, thumbUrl: null, lqip: null, width: null, height: null })
export const DEMO_USERS = {
  ananya: u('00000000-0000-4000-8000-000000000001', 'ananya', 'Ananya Rao', { isIdVerified: true, avatarUrl: av(11) }),
  rohan: u('00000000-0000-4000-8000-000000000002', 'rohan', 'Rohan Mehta', { avatarUrl: av(4) }),
  kabir: u('00000000-0000-4000-8000-000000000003', 'kabir', 'Kabir Singh', { avatarUrl: av(9) }),
  riya: u('00000000-0000-4000-8000-000000000004', 'riya', 'Riya Kapoor', { isIdVerified: true, avatarUrl: av(2) }),
  subodh: u('00000000-0000-4000-8000-000000000005', 'subodh', 'Subodh N.', { avatarUrl: av(7) }),
  tentit: u('00000000-0000-4000-8000-000000000006', 'tentitindia', 'Tent It India', { isHost: true, isIdVerified: true, avatarUrl: av(10) }),
  mihir: u('00000000-0000-4000-8000-000000000007', 'mihir', 'Mihir Desai', { avatarUrl: av(6) }),
  tara: u('00000000-0000-4000-8000-000000000008', 'tara', 'Tara Menon', { isIdVerified: true, avatarUrl: av(13) }),
  zoya: u('00000000-0000-4000-8000-000000000009', 'zoya', 'Zoya Khan', { avatarUrl: av(15) }),
  arnav: u('00000000-0000-4000-8000-000000000010', 'arnav', 'Arnav Iyer', { isIdVerified: true, avatarUrl: av(8) }),
  pahadi: u('00000000-0000-4000-8000-000000000011', 'pahadico', 'Pahadi Co.', { isHost: true, isIdVerified: true, avatarUrl: av(12) }),
}

const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10)
const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
const seats = (people: UserLite[], total: number, extra: Seat[] = []): Seat[] => {
  const s: Seat[] = people.map((p, i) => ({ state: i === 0 ? 'organiser' : 'member', user: p }))
  s.push(...extra)
  while (s.length < total) s.push({ state: 'open', user: null })
  return s
}
const viewer = { isAuthor: false, membership: null, saved: false, canJoin: true, joinBlockedReason: null } as Post['viewer']
const base: Pick<Post, 'media' | 'trip' | 'poll' | 'myReactions' | 'status' | 'meetingPoint' | 'updatedAt' | 'audience' | 'estCostText'> = {
  media: [], trip: null, poll: null, myReactions: [], status: 'live', meetingPoint: null, updatedAt: ago(1), audience: 'anyone', estCostText: null,
}

export const DEMO_TRIP: TripLite = {
  id: '00000000-0000-4000-8000-0000000000a1', slug: 'spiti-valley-expedition', title: 'Spiti Valley Winter Circuit',
  place: { name: 'Spiti, Himachal', slug: 'spiti', lat: null, lng: null }, image: null, priceFromPaise: 1899900,
  durationDays: 8, nextDeparture: day(34), seatsLeft: 4, seatsTotal: 12, host: DEMO_USERS.tentit, goingFaces: [DEMO_USERS.riya, DEMO_USERS.kabir],
}
const TUNGNATH = DEMO_TRIPS.find((t) => t.slug === 'tungnath-chandrashila') ?? DEMO_TRIP
const MANTHAN = DEMO_TRIPS.find((t) => t.slug === 'manthan-bir-billing') ?? DEMO_TRIP

export const DEMO_POSTS: Post[] = [
  {
    ...base, id: '00000000-0000-4000-8000-0000000000b1', kind: 'plan', author: DEMO_USERS.ananya,
    title: 'Spiti in January — 3 spots', body: 'Slow road trip from Shimla, homestays in Kaza and Langza. Looking for 3 easy-going people who are fine with cold mornings and no fixed itinerary.',
    place: { name: 'Spiti, Himachal', slug: 'spiti', lat: 32.2, lng: 78.0 }, startsOn: day(48), endsOn: day(55), spotsTotal: 4, memberCount: 2,
    estCostText: 'Est. ₹14,000 each, split among ourselves', reactions: { wantToGo: 9, helpful: 0, love: 2 }, commentCount: 6,
    seats: seats([DEMO_USERS.ananya, DEMO_USERS.subodh], 4), createdAt: ago(5), viewer,
  },
  {
    ...base, id: '00000000-0000-4000-8000-0000000000b2', kind: 'story', author: DEMO_USERS.rohan,
    title: 'Kheerganga, finally', body: 'Did the trail with the Tent It India group last month. The hot spring at the top after 12 km is everything people say. Tip: start before 8 so you are not climbing in the afternoon sun.',
    place: { name: 'Kheerganga', slug: 'kheerganga', lat: 32.0, lng: 77.5 }, startsOn: null, endsOn: null, spotsTotal: null, memberCount: 1,
    media: [photo('rupin.jpg')], trip: DEMO_TRIP, reactions: { wantToGo: 14, helpful: 8, love: 21 }, commentCount: 3, seats: [], createdAt: ago(20), viewer: { ...viewer, canJoin: false },
  },
  {
    ...base, id: '00000000-0000-4000-8000-0000000000b3', kind: 'ask', author: DEMO_USERS.kabir,
    title: null, body: 'First solo trek in December — Kedarkantha or Brahmatal? I have done Triund, nothing longer.',
    place: { name: 'Uttarakhand', slug: 'uttarakhand', lat: 30.5, lng: 78.5 }, startsOn: null, endsOn: null, spotsTotal: null, memberCount: 1,
    poll: { options: [{ id: 'a', label: 'Kedarkantha', votes: 11 }, { id: 'b', label: 'Brahmatal', votes: 6 }], myChoice: null },
    reactions: { wantToGo: 0, helpful: 5, love: 0 }, commentCount: 4, seats: [], createdAt: ago(30), viewer: { ...viewer, canJoin: false },
  },
  {
    ...base, id: '00000000-0000-4000-8000-0000000000b4', kind: 'plan', author: DEMO_USERS.riya,
    title: 'Gokarna beach weekend (women only)', body: 'Train from Bengaluru on Friday night, back Sunday. Beach-hopping Om to Paradise, very chill.',
    place: { name: 'Gokarna, Karnataka', slug: 'gokarna', lat: 14.5, lng: 74.3 }, startsOn: day(9), endsOn: day(11), spotsTotal: 3, memberCount: 1,
    audience: 'women', estCostText: 'Est. ₹5,000 each', reactions: { wantToGo: 6, helpful: 0, love: 3 }, commentCount: 1,
    seats: seats([DEMO_USERS.riya], 3), createdAt: ago(44), viewer: { ...viewer, canJoin: false, joinBlockedReason: 'women_only' },
  },
  // ── Extra fixtures so every Full Circle card state shows up locally ──
  {
    ...base, id: '00000000-0000-4000-8000-0000000000b5', kind: 'story', author: DEMO_USERS.kabir,
    title: null, body: 'Summit at 5:40am, minus 6. Eleven strangers on Friday, a group chat that won’t stop now.',
    place: { name: 'Tungnath → Chandrashila', slug: 'chopta', lat: 30.5, lng: 79.2 }, startsOn: null, endsOn: null, spotsTotal: null, memberCount: 1,
    media: [photo('tungnath.jpg')], trip: TUNGNATH, reactions: { wantToGo: 31, helpful: 4, love: 128 }, commentCount: 3, seats: [], createdAt: ago(2), viewer: { ...viewer, canJoin: false },
  },
  {
    ...base, id: '00000000-0000-4000-8000-0000000000b6', kind: 'ask', author: DEMO_USERS.mihir,
    title: null, body: 'First time in Spiti: which month would you pick?',
    place: { name: 'Spiti, Himachal', slug: 'spiti', lat: 32.2, lng: 78.0 }, startsOn: null, endsOn: null, spotsTotal: null, memberCount: 1,
    poll: { options: [{ id: 'a', label: 'September', votes: 81 }, { id: 'b', label: 'June', votes: 66 }, { id: 'c', label: 'January, for the snow', votes: 41 }, { id: 'd', label: 'October', votes: 26 }], myChoice: 'a' },
    reactions: { wantToGo: 0, helpful: 12, love: 0 }, commentCount: 18, seats: [], createdAt: ago(3), viewer: { ...viewer, canJoin: false },
  },
  {
    ...base, id: '00000000-0000-4000-8000-0000000000b7', kind: 'story', author: DEMO_USERS.riya,
    title: null, body: 'Took a pause at 2,730 m. Prashar Lake, day 2.',
    place: { name: 'Prashar Lake', slug: 'prashar', lat: 31.7, lng: 77.1 }, startsOn: null, endsOn: null, spotsTotal: null, memberCount: 1,
    media: [photo('maadhyam.jpg')], reactions: { wantToGo: 9, helpful: 0, love: 44 }, commentCount: 0, seats: [], createdAt: ago(3), viewer: { ...viewer, canJoin: false },
  },
  {
    ...base, id: '00000000-0000-4000-8000-0000000000b8', kind: 'story', author: DEMO_USERS.riya,
    title: null, body: 'Bir from the air. Ten minutes I keep replaying.',
    place: { name: 'Bir Billing', slug: 'bir', lat: 32.0, lng: 76.7 }, startsOn: null, endsOn: null, spotsTotal: null, memberCount: 1,
    media: [photo('manthan.jpg')], trip: MANTHAN, reactions: { wantToGo: 17, helpful: 0, love: 52 }, commentCount: 2, seats: [], createdAt: ago(9), viewer: { ...viewer, canJoin: false },
  },
  {
    ...base, id: '00000000-0000-4000-8000-0000000000b9', kind: 'plan', author: DEMO_USERS.arnav,
    title: 'Gokarna long weekend, beaches + Kudle', body: 'Overnight bus from Bengaluru on Friday, back Monday morning.',
    place: { name: 'Gokarna, Karnataka', slug: 'gokarna', lat: 14.5, lng: 74.3 }, startsOn: day(22), endsOn: day(25), spotsTotal: 6, memberCount: 3,
    estCostText: '~₹7k each', reactions: { wantToGo: 11, helpful: 0, love: 4 }, commentCount: 5,
    seats: [...seats([DEMO_USERS.arnav, DEMO_USERS.tara, DEMO_USERS.mihir], 3), { state: 'requested', user: DEMO_USERS.subodh }, { state: 'open', user: null }, { state: 'open', user: null }],
    createdAt: ago(5), viewer: { ...viewer, membership: 'requested', canJoin: false },
  },
  {
    ...base, id: '00000000-0000-4000-8000-0000000000ba', kind: 'ask', author: DEMO_USERS.zoya,
    title: null, body: 'Is Kheerganga OK to do solo in December? First solo trip.',
    place: { name: 'Kheerganga', slug: 'kheerganga', lat: 32.0, lng: 77.5 }, startsOn: null, endsOn: null, spotsTotal: null, memberCount: 1,
    reactions: { wantToGo: 0, helpful: 46, love: 0 }, commentCount: 12, seats: [], createdAt: ago(26), viewer: { ...viewer, canJoin: false },
  },
  {
    ...base, id: '00000000-0000-4000-8000-0000000000bb', kind: 'story', author: DEMO_USERS.tara,
    title: null, body: 'Valley of Flowers in the last week of the season. Worth every wet sock.',
    place: { name: 'Valley of Flowers', slug: 'vof', lat: 30.7, lng: 79.6 }, startsOn: null, endsOn: null, spotsTotal: null, memberCount: 1,
    media: [photo('vof.jpg')], reactions: { wantToGo: 22, helpful: 3, love: 61 }, commentCount: 0, seats: [], createdAt: ago(30), viewer: { ...viewer, canJoin: false, saved: true },
  },
]

export const DEMO_COMMENTS: Comment[] = [
  { id: 'c1', postId: DEMO_POSTS[0].id, parentId: null, author: DEMO_USERS.kabir, body: 'Is Kunzum open in January?', pollChoice: null, createdAt: ago(4), replies: [
    { id: 'c2', postId: DEMO_POSTS[0].id, parentId: 'c1', author: DEMO_USERS.ananya, body: 'No, we go via Kinnaur both ways. Longer but open all winter.', pollChoice: null, createdAt: ago(3), replies: [] },
  ] },
  { id: 'c3', postId: DEMO_POSTS[0].id, parentId: null, author: DEMO_USERS.riya, body: 'Langza homestays are lovely. Carry a power bank, it gets very cold.', pollChoice: null, createdAt: ago(2), replies: [] },
  { id: 'c4', postId: DEMO_POSTS[4].id, parentId: null, author: DEMO_USERS.tara, body: 'Was this the morning with the fog clearing at Chandrashila? Goosebumps.', pollChoice: null, createdAt: ago(1.8), replies: [
    { id: 'c5', postId: DEMO_POSTS[4].id, parentId: 'c4', author: DEMO_USERS.kabir, body: 'Exactly that one. You were two steps behind me.', pollChoice: null, createdAt: ago(1.5), replies: [] },
  ] },
  { id: 'c6', postId: DEMO_POSTS[4].id, parentId: null, author: DEMO_USERS.pahadi, body: 'Thanks for coming up with us! The next batch has 3 spots left.', pollChoice: null, createdAt: ago(1), replies: [] },
  { id: 'c7', postId: DEMO_POSTS[9].id, parentId: null, author: DEMO_USERS.tentit, body: 'Yes, but go with a group: the trail ices after 4pm and most cafés at the top shut by mid-Dec.', pollChoice: null, createdAt: ago(20), replies: [] },
]


export function demoEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.TRIBE_DEMO !== '0'
}

/** True when the DB error means the Tribe migrations aren't applied (table/function missing). */
export function isMissingSchema(e: unknown): boolean {
  const code = (e as { code?: string })?.code
  return code === '42P01' || code === '42883' || code === 'PGRST202' || code === 'PGRST205' || code === 'PGRST200'
}

/** Local preview with no reachable database (e.g. placeholder SUPABASE_URL in .env). */
export function isUnreachable(e: unknown): boolean {
  const m = `${(e as { message?: string })?.message ?? ''} ${(e as { details?: string })?.details ?? ''}`
  return /fetch failed|ENOTFOUND|ECONNREFUSED|getaddrinfo/i.test(m)
}

export function shouldUseDemo(e: unknown): boolean {
  return demoEnabled() && (isMissingSchema(e) || isUnreachable(e))
}
