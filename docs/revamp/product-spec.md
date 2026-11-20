# UnSOLO revamp: product spec

**Status:** draft on branch `main_revamped` (Nov 2026).
**Covers:** web (mobile and desktop), native Android and native iOS, and the shared API they all use.
**Design reference:** "Passenger Chart" mockups. See the v1, v2 and desktop galleries and [design-system.md](design-system.md).

## 1. What we're building

UnSOLO has two halves, and both share one account, one seat-row language and one API:

- **Explore** is where you book. It holds hosted trips, stays and activities. Money moves through UnSOLO here.
- **Tribe** is where you find your people. It holds Plans, Stories and Asks. It is informal, and no money moves through it.

**Target users:**

| User | What they do |
|---|---|
| Traveller | Browses, posts, joins plans, books |
| Host | Lists trips and stays, and makes offers on plans |
| Staff | Moderates content, supports users and reads analytics |

**Navigation:** Explore · Tribe · (+) Post · My trips · You. Messages and Activity sit in every header. Leaderboard and Hosting live under You.

**Desktop:**
- The same tabs become a top bar.
- Sheets become side panels and lists become ruled tables.
- Chat becomes three panes.

## 2. Phases

| Phase | Scope | Ships when |
|---|---|---|
| **P0 Foundation** | Passenger Chart tokens on web; shared `/api/v1` with bearer + cookie auth; migrations 119–121; device and preference tables; analytics events; security fixes (platform_settings writable by anyone, notification spoofing, rate limits) | API contract tests pass; web builds; no RLS regressions |
| **P1 Tribe MVP (web)** | Feed (For you, Plans, Stories, Asks); composer for 3 types; plan detail with join-by-request; one-level comments; 3 reactions; report and block; Activity; landing-tab preference | 20 seed posts live; staff moderation queue working |
| **P2 Native apps** | Android (Kotlin + Compose) and iOS (SwiftUI) on `/api/v1`: offline cache and sync, push, location suggestions, background image upload, email and phone auth | Internal testing track (Play) and TestFlight. TestFlight needs an Apple developer ID. |
| **P3 Growth loops** | Post-trip story prompt; share cards; two-way matching ("14 planning Spiti"); host offers that turn a plan into a hosted trip; SEO destination pages (Stories and Asks only) | Each loop behind its own flag |
| **P4 Scale and trust** | Ranking v2; DigiLocker verified badge; automated text and image screening; "Did it happen?" follow-up; grievance workflow SLA | Reports per 1k posts below 5; median first reply under 12h |

## 3. New database tables

The full SQL is in `supabase/migrations/119_*` to `121_*`. Every table has RLS enabled.

**Reused tables:** profiles, follows, chat_rooms, chat_room_members, messages, chat_polls, message_reactions, status_stories, join_requests, notifications, leaderboard_scores, phone_otp_verifications, reviews, team_members, audit_logs.

| Table | Purpose | Key columns | Who can read / write |
|---|---|---|---|
| `posts` | Plan, Story or Ask | `kind`, `author_id`, `body`, `place_name`, `lat/lng`, `starts_on/ends_on`, `spots_total`, `audience` (anyone / women / verified), `est_cost_text`, `trip_package_id`, `status` (live / hidden / removed / cancelled / past), `client_id` (idempotency for offline posts), counters | **Read:** anyone sees live posts; the author sees all of theirs. **Write:** author, with phone verified. |
| `post_media` | Photos for a post | `post_id`, `url`, `thumb_url`, `lqip` (tiny base64), `width`, `height`, `bytes` | Same as the parent post |
| `post_comments` | Comments, with one reply level | `post_id`, `parent_id` (null or a top-level comment), `body`, `status` | **Read:** anyone on live posts. **Write:** signed-in, verified users. |
| `post_reactions` | Reactions | `post_id`, `user_id`, `kind` (`want_to_go`, `helpful`, `love`). Primary key is `(post_id, user_id, kind)`. | **Read:** anyone. **Write:** your own reactions only. |
| `post_tags` | People tagged in Stories | `post_id`, `user_id`, `state` (asked / accepted / declined) | **Read:** the tagged user and the author. **Write:** the tagged user answers. |
| `plan_members` | Who's in a plan | `post_id`, `user_id`, `role` (organiser / member), `state` (requested / approved / declined / withdrawn / expired), `intro`, `expires_at` (72h) | **Read:** members and the organiser. **Write:** the requester creates; the organiser decides. |
| `host_offers` | A host offering to run a plan | `post_id`, `host_id`, `price_paise`, `includes[]`, `notes`, `extra_seats`, `state`, `expires_at` (7d), `package_id` once accepted | **Read:** the organiser, approved members and the host. **Write:** a host creates; the organiser decides. |
| `saved_posts` | Saved posts | `user_id`, `post_id` | Your own only |
| `reports` | Reports from users | `target_type` (post / comment / user / message), `target_id`, `reason`, `details`, `state`, `assigned_to`, `resolution` | **Write:** the reporter. **Read and update:** staff. |
| `moderation_actions` | Audit trail of moderation | `report_id`, `actor_id`, `action` (hide / remove / restore / warn / suspend / ban / dismiss), `note` | Staff only |
| `user_blocks` | Blocks | `blocker_id`, `blocked_id` | Your own only |
| `user_sanctions` | Strikes and bans | `user_id`, `kind` (warn / mute / suspend / ban), `until` | **Read:** the user and staff. **Write:** staff. |
| `device_tokens` | Push tokens | `user_id`, `platform` (ios / android / web), `token`, `app_version`, `last_seen_at` | Your own only |
| `user_preferences` | Per-user settings | `landing_tab` (explore / tribe / trips), `notify` jsonb (per channel and category), `interests[]`, `suggest_by_location`, `suggest_by_gender`, `share_location` | Your own only |
| `analytics_events` | Usage events (append-only) | `user_id?`, `anon_id`, `name`, `props` jsonb, `platform`, `screen`, `ts` | Anyone can insert (validated through the API). Staff can read. |
| `rate_limits` | Fixed-window counters | `key`, `window_start`, `count` | Service role only |

**New columns on `profiles`:**
- `gender` (woman / man / nonbinary / prefer_not)
- `home_city`, `home_lat`, `home_lng`
- `is_id_verified`
- `last_active_at`

**Database functions:**
- `tribe_feed(viewer, kind, place, cursor)`: ranked feed.
- `suggest_for_user(viewer, lat, lng)`: plans, departures and stays nearby, on your dates and matching your interests.
- `expire_stale_plan_requests()`, `expire_host_offers()`: run by cron.
- `accept_host_offer(offer_id)`: atomic. It creates the package, holds the seats and sends notifications.

## 4. Moderation rules

**Who can do what**

| Action | Requirement |
|---|---|
| Browse | Anyone, signed in or not |
| Post, comment, join, react | Signed in and phone OTP verified |
| Women-only plans and plans of 5+ | Organiser must be ID-verified. For women-only plans, joiners must be women and verified. |
| Age | 18+ only. Date of birth is collected at sign-up. |

**Automatic checks before a post goes live** (server side, `src/lib/moderation/screen.ts`)
1. **Contact info is hidden:** phone numbers, UPI IDs and email addresses are replaced with "contact hidden".
2. **Money words** ("₹/person", "advance", "pay me", a UPI pattern) trigger the prompt "Charging for this? List it as a hosted trip." The post is held until it is edited or confirmed as non-commercial.
3. **Links:** outside links are not clickable and become plain text. unsolo.in links stay as links.
4. **Blocklist:** a match on slurs or sexual or violent terms holds the post as `hidden` and queues a review.
5. **Rate limits:**

   | Account | Posts per day | Comments per hour | Join requests per day |
   |---|---|---|---|
   | New (first 7 days) | 3 | 20 | 10 |
   | Established | 10 | 60 | 30 |

**Reports**
- Report and block are one tap from every post, comment, profile and message.
- Reason codes: spam, scam or money, harassment, unsafe meetup, fake profile, hate, sexual content, other.
- **Auto-hide threshold:** 3 distinct reporters, or 1 report of type "unsafe meetup" on a women-only plan. The post is hidden until staff review it.
- **Response SLA:**
  - Safety reasons (harassment, unsafe meetup, sexual content): first action within 2h.
  - Everything else: within 24h.
  - The grievance officer resolves within 15 days, as the IT Rules 2021 require.
- **Staff actions:** hide, remove, restore, warn, mute (7 days), suspend (30 days) or ban.
  - Every action writes to `moderation_actions` with a note.
  - The affected user gets a notification with the reason and how to appeal.
- **Strikes:** two upheld reports in 90 days means a 7-day mute; three means a suspension and staff review of a ban.

**Safety by design**
- Joining is by request, with a required intro. Requests expire after 72h.
- The exact meeting point and the plan chat unlock only after approval.
- Messages from strangers arrive as requests.
- The app prompts users to meet first in a public place and offers "Share plan with a trusted contact". Afterwards it asks "Did it happen?".

**Staff permissions** (extends `admin-permissions.ts`)
- `moderation`: social_media_manager, chat_responder.
- `analytics`: admin.
- `user_sanctions`: admin only.

## 5. Rollout plan

| Week | Step | Gate to proceed |
|---|---|---|
| 0 | Apply migrations 119–121 to staging Supabase. Deploy the web branch to a Vercel preview. Staff seed 20 posts (stories from past reviews, with consent). | RLS test suite green; no regressions in `vitest` |
| 1 | Web Tribe at 10%, behind `platform_settings.tribe_enabled` and a percentage rollout. Staff and hosts answer the first asks. | Moderation queue under 2h p50; reports per 1k posts under 10 |
| 2 | Web Tribe for 100% of signed-in users. Explore bridge row on. Landing-tab prompt after the third Tribe visit in 7 days. | Posting at 5% or more of weekly active users |
| 3–4 | Android internal testing track (Play Console needed), then closed beta for about 50 users. Push on. | Crash-free sessions at 99.5% or more; cold start under 2s on a mid-range device |
| 4–6 | iOS: simulator build now. TestFlight once the Apple developer ID and APNs key exist. | Same as Android |
| 6+ | Growth loops one by one: story prompt, then share cards, then matching, then host offers, then SEO pages. Each runs as a 2-week A/B behind a flag. | Each loop's metric moves (below) or it gets rolled back |

**Kill switches** in `platform_settings`:
- `tribe_enabled`
- `tribe_posting_enabled`
- `host_offers_enabled`
- `push_enabled`

Turning any of these off takes effect immediately on every platform, because each app reads `/api/v1/config` when it launches and every 15 minutes.

**Metrics to watch for 90 days:**

| Area | Metric |
|---|---|
| Posting | % of weekly users who post |
| Plans | Fill rate (at least 1 approved joiner in 7 days); "Did it happen?" yes rate |
| Asks | Median time to first reply under 12h; % of asks answered |
| Money | Bookings from tagged stories and matched plans; plans that become hosted trips |
| Health | D30 retention of feed users vs others; reports per 1k posts; women who post again |

## 6. Inputs needed from the team

These are left blank in the code and listed in [setup-inputs.md](setup-inputs.md):
- Supabase phone provider (2factor / MSG91 / Twilio)
- Email SMTP sender
- FCM `google-services.json` and service account
- APNs key and team ID
- Apple developer ID and bundle signing
- Play Console
- Web Push VAPID keys
- DigiLocker partner API
- Grievance officer name and email
