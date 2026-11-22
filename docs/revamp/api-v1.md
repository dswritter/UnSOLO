# UnSOLO API v1

This is the shared contract for the web, Android and iOS apps. The routes live in `src/app/api/v1/**` (Next.js route handlers on Vercel, region bom1). Clients use `https://unsolo.in/api/v1`. For local work, use `http://10.0.2.2:3000/api/v1` on the Android emulator and `http://localhost:3000/api/v1` on the iOS simulator.

## Conventions

- **Auth:** send `Authorization: Bearer <Supabase access_token>`. The web app can rely on its session cookie instead. Endpoints that require sign-in return `401 {"error":{"code":"unauthorized"}}` when no session is present.
- **Client header:** send `X-UnSOLO-Client: android/1.0.0 (1)`, `ios/1.0.0 (1)` or `web`. The server uses it for analytics and to enforce the minimum app version.
- **JSON:** keys are camelCase. Times are ISO-8601 UTC. Dates are `YYYY-MM-DD`. Money is in **paise** (integer).
- **Errors:** `{"error":{"code":"<code>","message":"<human text>","field?":"<name>"}}`.

  | Code | HTTP status |
  |---|---|
  | `bad_request` | 400 |
  | `unauthorized` | 401 |
  | `phone_required` | 403 |
  | `forbidden` | 403 |
  | `not_found` | 404 |
  | `conflict` | 409 |
  | `held_for_review` | 202 (not an error, see `POST /posts`) |
  | `rate_limited` | 429, with a `Retry-After` header |
  | `upgrade_required` | 426 |
  | `server_error` | 500 |

- **Pagination:** every list returns `{ "items": [...], "nextCursor": "opaque" | null }`. To fetch the next page, pass `?cursor=`.
- **Idempotency:** creates take a `clientId` (a UUID generated on the device). If the same `clientId` is sent again, the server returns the original object with status 200. This is what makes offline queues safe to retry.
- **Caching:**
  - Public GETs send `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` and an `ETag`. Clients send `If-None-Match` and receive a 304 when nothing changed.
  - Private GETs send `Cache-Control: private, no-store`.

## Shared models

```ts
UserLite   { id, username, name, avatarUrl|null, isPhoneVerified, isIdVerified, isHost }
Media      { url, thumbUrl|null, lqip|null /* data:image/webp;base64,… ≤2KB */, width|null, height|null }
Place      { name, slug|null, lat|null, lng|null }
Seat       { state: "organiser"|"host"|"member"|"you"|"requested"|"held"|"open", user: UserLite|null }
TripLite   { id, slug, title, place: Place|null, image: Media|null, priceFromPaise, durationDays,
             nextDeparture: "YYYY-MM-DD"|null, seatsLeft|null, seatsTotal|null, host: UserLite|null,
             goingFaces: UserLite[] /* up to 5, signed-in only */ }
Post       { id, kind: "plan"|"story"|"ask", author: UserLite, title|null, body, place: Place|null,
             startsOn|null, endsOn|null, spotsTotal|null, memberCount, audience: "anyone"|"women"|"verified",
             estCostText|null, media: Media[], trip: TripLite|null,
             poll: { options: [{ id, label, votes }], myChoice|null }|null,
             reactions: { wantToGo, helpful, love }, myReactions: ("want_to_go"|"helpful"|"love")[],
             commentCount, status: "live"|"held"|"hidden"|"removed"|"cancelled"|"past",
             seats: Seat[] /* plans only, organiser first */, createdAt, updatedAt,
             viewer: { isAuthor, membership: null|"requested"|"approved"|"declined"|"withdrawn"|"expired",
                       saved, canJoin, joinBlockedReason: null|"full"|"women_only"|"verified_only"|"own_plan"|"phone_required" },
             meetingPoint|null /* only for organiser + approved members */ }
Comment    { id, postId, parentId|null, author: UserLite, body, pollChoice|null, createdAt, replies: Comment[] }
HostOffer  { id, postId, host: UserLite, pricePaise, includes: string[], notes|null, extraSeats,
             state: "pending"|"accepted"|"declined"|"expired"|"withdrawn", expiresAt, packageSlug|null, payBy|null }
Booking    { id, status, travelDate, guests, totalPaise, paidPaise, balancePaise, confirmationCode|null,
             trip: TripLite, chatRoomId|null }
Notification { id, type, category: "plans"|"replies"|"messages"|"trips"|"tags"|"system", title, body|null,
               link|null /* internal path, e.g. /tribe/p/<id> */, isRead, createdAt,
               postId?: uuid, actorId?: uuid /* Tribe events, for inline actions */ }
Preferences { landingTab: "explore"|"tribe"|"trips", notify: { push: {plans,replies,messages,trips,tags,marketing},
              email: {...}, quietHours: { from: "22:00", to: "07:00" } }, interests: string[],
              suggestByLocation, suggestByGender, shareLocation, dataSaver }
```

## Endpoints

### Config and session

| Method | Path | Auth | Body / query → response |
|---|---|---|---|
| GET | `/config` | public | → `{ flags: { tribeEnabled, tribePostingEnabled, hostOffersEnabled, pushEnabled }, minAppVersion: { android, ios }, supabase: { url, anonKey }, upload: { maxBytes: 2097152, maxEdge: 2048 }, support: { whatsapp, email } }` |
| GET | `/me` | user | → `{ user: UserLite & { email, phone, gender, homeCity, bio, dateOfBirth }, role, isStaff, preferences: Preferences, counts: { unreadNotifications, unreadMessages } }` |
| PATCH | `/me` | user | `{ name?, bio?, gender?, homeCity?, homeLat?, homeLng?, dateOfBirth? }` → `/me` |
| GET / PUT | `/me/preferences` | user | `Preferences` (PUT accepts a partial object) |
| GET | `/me/landing-suggestion` | user | → `{ suggest: "tribe"\|"trips"\|null, visits: { explore, tribe, trips } }`. Returns a tab when it was the most-opened tab over the last 14 days (at least 3 opens), it is not already the landing tab, and the prompt has not been dismissed. |
| POST | `/me/landing-suggestion/dismiss` | user | → 204 |
| POST | `/me/phone/start` | user | `{ phone: "+9198…" }` → `{ sent: true, devCode? }`. This is phone verification for an existing account. `devCode` is returned only when no SMS provider is configured, and only outside production. |
| POST | `/me/phone/verify` | user | `{ phone, code }` (4 digits) → `{ verified: true }` |
| POST | `/auth/phone/start` | public | **Phone sign-in** through our SMS gateway (2factor.in or MSG91), not a Supabase SMS provider. `{ phone }` → `{ challenge, expiresIn: 300, devCode? }`. The challenge is signed and doesn't contain the code. Limits fail closed: one code per 30 s, 5 per number per hour, 20 per IP per hour, 60 per IP per day. |
| POST | `/auth/phone/verify` | public | `{ challenge, code }` (4 digits) → the same session JSON as Supabase `/auth/v1/verify` (`access_token`, `refresh_token`, `expires_in`, `expires_at`, `user`), plus `is_new`. Each code allows 5 tries and works once. It signs into the profile that has this verified number, or creates a phone-only account whose placeholder auth email is `<digits>@phone.unsolo.in`. That email is never mailed or shown: `/me` returns `email: null`. Refresh stays with Supabase. |
| POST | `/devices` | user | `{ platform: "android"\|"ios"\|"web", token, appVersion?, locale? }` → 204 (upsert) |
| DELETE | `/devices` | user | `{ token }` → 204 (call on sign-out) |

**Sign-in** goes to Supabase Auth directly (`{supabase.url}/auth/v1/...` with header `apikey: anonKey`):

| Method | Supabase endpoint | Use |
|---|---|---|
| Email + password | `POST /signup`, `POST /token?grant_type=password` | |
| Email code | `POST /otp {email, create_user:true}` → `POST /verify {type:"email", email, token}` | |
| Phone code | `POST /otp {phone}` → `POST /verify {type:"sms", phone, token}` | Needs an SMS provider configured in Supabase (see setup-inputs.md) |
| Refresh | `POST /token?grant_type=refresh_token {refresh_token}` | |
| Sign out | `POST /logout` | |
| Password reset | `POST /recover {email}` | |

Store tokens in the Android Keystore (EncryptedSharedPreferences) or the iOS Keychain, never in plain preferences.

### Explore (hosted, bookable)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/explore?q=&category=trips\|stays\|activities\|rentals&month=YYYY-MM&cursor=&limit=20` | public | → `{ items: TripLite[], nextCursor }`. Trips: sorted by next departure. Stays/activities/rentals: public listings as TripLite with `kind` (stay/activity/rental), `unit` (night/person/day) and `webPath` (`/listings/{category}/{slug}`, opened on the web); no departures or seats |
| GET | `/places?q=&limit=8` | public | → `{ items: { name, slug, lat, lng, detail }[] }`: suggestions for the place field (our destinations, places in live posts, then OpenStreetMap; empty q = popular) |
| GET | `/users/{username}` | public | Profile: `user` (bio, statusText, location, instagramUrl, websiteUrl, travelStyle, joinedAt, followers, following), `stats` (trips, states, reviews, listings, points, rank, tier), `followsYou`, `isFollowing`, `phone` (masked unless public/approved), `travel` (states, trips, mutualPlaces), `badges` (earned, next), `listings`, `reviewsWritten`, `host` (travellers, reviews, reachedOut on your own), `connections` (mutual, rooms, shared), `posts`, `openPlan` |
| PUT/DELETE | `/users/{username}/follow` | signed in | Follow / unfollow → `{ isFollowing, followers, following }` |
| POST | `/users/{username}/phone-request` | verified contact | Ask for their number |
| GET | `/me/phone-requests` · PUT `/me/phone-requests/{id}` `{ approve }` | signed in | Pending requests for your number; share or decline |
| GET | `/statuses?user=` | signed in | → `{ authors: { user, items: StatusItem[], unseen, latestAt }[] }`: live 24-hour stories you can see (yours first, then unseen); `user` = one person's |
| POST | `/statuses` `{ media: { url }[] ≤10, caption?, audience: all\|followers }` | verified contact | One story per photo (or a text story), expires in 24 h, max 10 live; photos uploaded first via `/uploads` purpose `story` |
| DELETE | `/statuses/{id}` | yours | Removes it now |
| POST | `/statuses/seen` `{ ids }` | signed in | Marks seen (rings, view counts) |
| PUT | `/posts/{id}/vote` `{ choice: "a".."d" \| null }` | verified contact | One vote per person per poll (post_poll_votes, migration 122), changed in place; null takes it back. → `{ poll }`. Votes are not replies. |
| GET | `/trips/{slug}` | public | → `TripLite & { description, includes: string[], images: Media[], departures: [{ date, seatsLeft, seatsTotal }], seats: Seat[] (next departure; faces only for signed-in viewers), rating: { avg, count }, stories: Post[] /* show_on_trip_page */, planningCount /* "14 planning Spiti", only when ≥3 */ }` |
| GET | `/my/trips` | user | → `{ upcoming: Booking[], plans: Post[] /* organiser or approved */, requested: Post[], past: Booking[] /* includes storyPrompt: bool */ }` |

Booking and payment stay on the existing Razorpay checkout pages. Apps open `/packages/{slug}?book=1` in an in-app browser tab (Custom Tabs or SFSafariViewController), and the session is handed over with a deep link. Native payment SDKs are phase 3.

### Tribe

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/feed?kind=plan\|story\|ask&place=&lat=&lng=&cursor=` | public | → `{ items: Post[], nextCursor, caughtUp, nextDepartures: TripLite[] }`. About 1 in 8 items is a placed `{ kind: "placed_trip", trip }` card: these items have `kind` "placed_trip" and a `trip` field. |
| POST | `/posts` | user + phone | `{ clientId, kind, title?, body, place?: Place, startsOn?, endsOn?, spotsTotal?, audience?, estCostText?, meetingPoint?, tripPackageId?, showOnTripPage?, poll?: string[] (2–4), media?: Media[] (≤6, from /uploads), tagUserIds?: uuid[] }` → `201 { post, moderation: { state: "live"\|"held", prompts: ("money"\|"contact_hidden"\|"links_disabled")[] } }`. The server rewrites the body to hide contact details. |
| GET | `/posts/{id}` | public | → `{ post, comments: Comment[], offers: HostOffer[] /* only for organiser and members */ }` |
| PATCH | `/posts/{id}` | author | Same fields as POST, all optional, plus `status: "cancelled"`. |
| DELETE | `/posts/{id}` | author | → 204 |
| PUT / DELETE | `/posts/{id}/reactions/{want_to_go\|helpful\|love}` | user | → `{ reactions, myReactions }` |
| PUT / DELETE | `/posts/{id}/save` | user | → 204 |
| GET | `/posts/{id}/comments?cursor=` | public | → `{ items: Comment[], nextCursor }` |
| POST | `/posts/{id}/comments` | user + phone | `{ clientId, body, parentId?, pollChoice? }` → `201 Comment` |
| DELETE | `/comments/{id}` | author | → 204 |
| POST | `/posts/{id}/join` | user + phone | `{ intro }` (10–500 characters) → `{ membership: "requested", expiresAt }` |
| DELETE | `/posts/{id}/join` | user | Withdraws the request → 204 |
| GET | `/posts/{id}/requests` | organiser | → `{ items: [{ user: UserLite & { tripsCount, reviewsAvg, mutuals }, intro, state, createdAt, expiresAt }] }` |
| POST | `/posts/{id}/requests/{userId}` | organiser | `{ decision: "approve"\|"decline" }` → `{ state }` |
| POST | `/posts/{id}/offers` | host | `{ pricePaise, includes: string[], notes?, extraSeats? }` → `201 HostOffer` |
| POST | `/offers/{id}/accept` | organiser | `{ expectedPricePaise }` (the price shown) → `{ packageSlug, payBy }`. Returns 409 if the host changed the price since. |
| POST | `/offers/{id}/decline` | organiser | → 204 |
| GET | `/users/{username}` | public | → `{ user: UserLite & { bio, homeCity, tripsCount, followers, following }, posts: Post[], openPlan: Post\|null, isFollowing }` |
| GET | `/suggestions?lat=&lng=` | public | → `{ items: [{ type: "plan"\|"trip", reason: "Near you"\|"Women-only plan"\|"Leaving soon"\|"Matches your interests"\|"Open spots", post?: Post, trip?: TripLite }] }` |

### Chat

Chat covers trip groups, plan groups, community rooms and DMs. It reuses the existing `chat_rooms` and `messages` tables.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/chats?type=trip\|direct\|general&cursor=` | user | → `{ items: [{ id, type, name, image: Media\|null, lastMessage: { body, at, authorName }\|null, unread, isRequest /* DM from a non-follower */ }], nextCursor }` |
| GET | `/chats/{roomId}/messages?before=ISO\|after=ISO&limit=40` | member | → `{ items: [{ id, clientId\|null, author: UserLite, body, type: "text"\|"image"\|"system", createdAt, editedAt\|null }], hasMore }`, newest last |
| POST | `/chats/{roomId}/messages` | member | `{ clientId, body }` → `201` message. This is an optimistic send: the client renders a pending bubble keyed by `clientId` and swaps it for the server copy when the response arrives. |
| POST | `/chats/{roomId}/read` | member | → 204 |
| POST | `/chats/direct` | user | `{ userId }` → `{ roomId }` |

**Live updates:**
- While a chat screen is open, the app polls `GET /chats/{id}/messages?after=ISO` every 4s. The poll backs off to 15s after 1 minute with no new messages.
- In the background, push notifications deliver new messages.
- The web app keeps using Supabase Realtime.

### Safety

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/reports` | user | `{ targetType: "post"\|"comment"\|"user"\|"message", targetId, reason: "spam"\|"scam_money"\|"harassment"\|"unsafe_meetup"\|"fake_profile"\|"hate"\|"sexual"\|"other", details? }` → `201 { id }`. A repeat report returns 200. |
| POST | `/blocks` | user | `{ userId }` → 204 |
| DELETE | `/blocks/{userId}` | user | → 204 |

### Notifications, sync, uploads and analytics

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/notifications?cursor=` | user | → `{ items: Notification[], nextCursor, unread }` |
| POST | `/notifications/read` | user | `{ ids?: uuid[], all?: true }` → 204 |
| GET | `/sync?since=ISO` | user | → `{ serverTime, posts: uuid[] /* refetch */, removedPosts: uuid[] /* drop from cache */, notifications, unreadNotifications, memberships: [{ postId, state }] }` |
| POST | `/uploads` | user | Multipart: `file`, `purpose=post\|avatar\|story\|host`. → `201 Media & { bytes }`. Clients compress to **≤2 MB** with a long edge of ≤2048 px before sending. The server re-encodes to WebP (full size plus a 320 px thumbnail plus an LQIP) and rejects anything over 5 MB. |
| POST | `/events` | public | `{ events: [{ name, screen?, props?, ts?, anonId?, sessionId? }] }` with at most 50 per call → 202. Event names match `^[a-z][a-z0-9_.]{1,63}$`, and `props` must be ≤4 KB. |

### Staff

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/admin/reports?state=open&cursor=` | staff (moderation) | → `{ items: [report + target preview], nextCursor, counts }` |
| POST | `/admin/reports/{id}/action` | staff | `{ action: "hide"\|"remove"\|"restore"\|"warn"\|"mute"\|"suspend"\|"ban"\|"dismiss", note }` → `{ state }` |
| GET | `/admin/analytics?days=30` | staff (analytics) | → the `admin_analytics_overview` JSON |

## Standard analytics events

| Event | Props |
|---|---|
| `app.open` | `{ coldStart, landingTab }` |
| `screen.view` | `{ }`, with `screen` set to one of: `explore`, `tribe`, `trips`, `you`, `trip_detail`, `post_detail`, `compose`, `activity`, `inbox` |
| `trip.view` | `{ slug }` |
| `trip.take_seat` | `{ slug, date }` |
| `post.create` | `{ kind, held }` |
| `post.react` | `{ kind }` |
| `post.comment` | |
| `plan.join_request` | |
| `plan.approve` | |
| `share.plan` | `{ channel }` |
| `push.open` | `{ type }` |
| `landing.prompt_shown` | |
| `landing.prompt_accepted` | `{ tab }` |
| `suggestion.tap` | `{ type, reason }` |

## Push payloads

The server fans out from `notifications` rows where `pushed_at` is null (see `src/lib/push/`).

| Platform | Payload |
|---|---|
| Android (FCM data message) | `{ "type": "...", "title": "...", "body": "...", "link": "/tribe/p/<id>", "notificationId": "...", "category": "plans" }`, delivered on channels `plans`, `replies`, `messages`, `trips` and `system` |
| iOS (APNs) | `aps.alert {title, body}`, `aps.thread-id = category`, plus custom keys `link` and `notificationId` |
| Web Push | `{ title, body, link, tag: category }` |

Pushes respect `preferences.notify.push[category]` and quiet hours (Asia/Kolkata). The `messages` and `trips` categories are allowed through quiet hours.

**Deep links:** `https://unsolo.in/...` App Links / Universal Links, plus `unsolo://...`.

| Path | Opens |
|---|---|
| `/tribe` | Tribe feed |
| `/tribe/p/{id}` | Post |
| `/packages/{slug}` | Trip |
| `/bookings` | My trips |
| `/profile/{username}` | Profile |
| `/chat/{roomId}` | Chat |
