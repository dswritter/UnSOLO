/**
 * Sample hosted departures for LOCAL preview only (never production), used by Explore when no
 * database is reachable. Photos come from the dev-only /dev/img route. Mirrors the mockups.
 */
import type { TripLite, UserLite } from './models'

const img = (name: string) => ({ url: `/dev/img/${name}`, thumbUrl: null, lqip: null, width: null, height: null })
const host = (id: string, username: string, name: string, av: number): UserLite => ({
  id: `00000000-0000-4000-8000-0000000001${id}`, username, name, avatarUrl: `/dev/img/av/a${av}.jpg`, isPhoneVerified: true, isIdVerified: true, isHost: true,
})
const face = (i: number, name: string): UserLite => ({
  id: `00000000-0000-4000-8000-0000000002${String(i).padStart(2, '0')}`, username: name.toLowerCase().replace(/\s+/g, ''), name, avatarUrl: `/dev/img/av/a${i}.jpg`, isPhoneVerified: true, isIdVerified: false, isHost: false,
})
const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10)
const FACES = [face(1, 'Priya Shah'), face(4, 'Rohan Kale'), face(6, 'Meera Joshi'), face(9, 'Kabir Tandon'), face(11, 'Ananya Rao')]

let seq = 0
const t = (slug: string, title: string, place: string, image: string, price: number, days: number, inDays: number, total: number, taken: number, h: UserLite): TripLite => ({
  id: `00000000-0000-4000-8000-0000000003${String(++seq).padStart(2, '0')}`,
  slug, title, place: { name: place, slug: null, lat: null, lng: null }, image: img(image), priceFromPaise: price * 100, durationDays: days,
  nextDeparture: day(inDays), seatsLeft: total - taken, seatsTotal: total, host: h, goingFaces: FACES.slice(0, Math.min(taken, 5)),
})

const EXPLORING = host('01', 'exploringsoul', 'Exploring Soul', 3)
const AARAV = host('02', 'aarav', 'Aarav Treks', 5)
const NOMAD = host('03', 'nomadtrails', 'Nomad Trails', 8)
const TREKTRIBE = host('04', 'trektribe', 'Trek Tribe', 10)
const PAHADI = host('05', 'pahadico', 'Pahadi Co.', 12)
const GANGA = host('06', 'gangagang', 'Ganga Gang', 14)

export const DEMO_TRIPS: TripLite[] = [
  t('chalo-himachal', 'Chalo Himachal', 'Manali · Kasol · Bir', 'maadhyam.jpg', 14699, 10, 6, 12, 0, EXPLORING),
  t('manthan-bir-billing', 'Manthan · Bir Billing', 'Bir, Himachal', 'manthan.jpg', 27000, 5, 7, 12, 3, AARAV),
  t('valley-of-flowers', 'Valley of Flowers', 'Govindghat, Uttarakhand', 'vof.jpg', 12999, 6, 8, 12, 12, PAHADI),
  t('bhutan-thunder-dragon', 'Land of the Thunder Dragon', 'Paro · Thimphu, Bhutan', 'bhutan.jpg', 28500, 7, 15, 12, 0, NOMAD),
  t('rupin-pass', 'Rupin Pass Trek', 'Dhaula, Uttarakhand', 'rupin.jpg', 18900, 8, 23, 10, 7, TREKTRIBE),
  t('tungnath-chandrashila', 'Tungnath → Chandrashila', 'Chopta, Uttarakhand', 'tungnath.jpg', 8499, 4, 28, 14, 11, PAHADI),
  t('rishikesh-weekend', 'Rishikesh Weekend', 'Rishikesh, Uttarakhand', 'rishikesh.jpg', 6999, 3, 29, 16, 5, GANGA),
  t('madhmaheshwar', 'Madhmaheshwar Trek', 'Ransi, Uttarakhand', 'madhma.jpg', 11200, 6, 33, 10, 2, TREKTRIBE),
]
