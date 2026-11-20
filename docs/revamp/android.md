# UnSOLO Android app

**Where:** `mobile/android/` (branch `main_revamped`)
**Stack:** Kotlin + Jetpack Compose, single activity, offline-first, built against [api-v1.md](api-v1.md)
**Status:** P2 native app. Every screen in the v2 mockups works end to end against bundled demo data. The real `/api/v1` is not deployed yet: `https://unsolo.in/api/v1/config` returns 404 today.

## 1. Build and run

| Need | Version |
|---|---|
| JDK | 17 or newer (built with JDK 21) |
| Android SDK | platform `android-35`, build-tools 34+ |
| Gradle | 8.10.2, through the wrapper |
| Android Gradle Plugin | 8.7.3 |
| Kotlin | 2.1.0 |
| KSP | 2.1.0-1.0.29 |

```bash
cd mobile/android
echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties    # gitignored
cp secrets.properties.example secrets.properties               # optional; gitignored
./gradlew :app:assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:testDebugUnitTest      # 39 JVM unit tests
./gradlew :app:assembleRelease        # R8 + shrinkResources; unsigned until a keystore exists
adb -s <serial> install -r app/build/outputs/apk/debug/app-debug.apk
```

**Build types:**

| | Debug | Release |
|---|---|---|
| API base URL | `http://10.0.2.2:3000/api/v1/` (the Next.js dev server as seen from the emulator) | `https://unsolo.in/api/v1/` |
| `DEMO_MODE` | `true` | `false` |
| Cleartext HTTP | Allowed only for `10.0.2.2`, `localhost` and `127.0.0.1`, through a debug-only `network_security_config` | None |
| R8 and resource shrinking | Off | On |
| Size | About 14.9 MB | About 2.8 MB |

- **applicationId:** `com.unsolo.app` in both build types, so the existing `assetlinks.json` applies.
- **SDK levels:** minSdk 26; compileSdk and targetSdk 35.

**Supabase:** the app reads `supabase.url` and `supabase.anonKey` from `GET /config` at launch. The `SUPABASE_URL` and `SUPABASE_ANON_KEY` values in `secrets.properties` (read into `BuildConfig`) are only fallbacks. No secret is in the source.

**To point a debug build at a local server:**
1. Run `npm run dev` in the repo root.
2. Set `DEMO_MODE` to `false` for debug in `app/build.gradle.kts`.

## 2. Demo mode

`core/demo/DemoBackend.kt` is an in-process fake of the whole contract, plus Supabase Auth.
- It is served by `DemoApiInterceptor`, an OkHttp interceptor that sits after the auth interceptor.
- It loads the JSON fixtures in `app/src/main/assets/demo/` (17 files):
  - Trips: Spiti, Kheerganga, Valley of Flowers, Rishikesh, Tungnath, Bhutan and others.
  - People: Ananya, Rohan, Kabir, Riya, Meher and others.
  - Host: Tent It India.
- Images are generated vector placeholders (`res/drawable/ph_*`, `av_*`, `logo_tentit`) referenced as `demo://name`. A Coil mapper resolves them (`DemoImages`).

**When demo mode is on:**
- Always in debug builds (`BuildConfig.DEMO_MODE`).
- In any build, on a first launch with nothing cached, when the probe `GET /config` fails: unreachable, 404 or HTML.
  - API calls wait briefly on a latch until the probe has decided (`DemoMode.decided`).
  - A "Demo data · server not connected" strip shows above the tab bar.
  - The cache is marked `demo_cache`. On the next launch that cache is wiped and the probe runs again, so demo data never mixes with real data.

**What the demo backend behaves like:**
- **Idempotency:** creates are keyed by `clientId`.
- **Moderation:**
  - Money words, a UPI pattern or "advance" make a post `held` with prompt `money`.
  - Phone numbers and emails are replaced with "contact hidden".
  - Outside links add `links_disabled`.
  - Edits are screened again.
- **Joins:** an intro of 10–500 characters is required. The seat becomes `requested`. Approving fills a seat.
- **Chat:** a canned reply arrives about 6 seconds after you send, so the 4-second poll has something to pick up.
- **Phone verification:** the code is `123456` (returned as `devCode`).
- **Landing suggestion:** computed from the `screen.view` events the app sends to `POST /events`.
- **Sign-in:** the auth screen has **Use the demo traveller**, a phone-verified "Dev Sharma". Email and password (6+ characters) and email or phone codes (any 6 digits) also work. Email sign-ins start unverified, so the phone verification gate can be seen.

**Limitation:** the demo backend's state is in memory. After a process restart, posts you created disappear from the server feed. The local Room copy keeps your held and failed drafts.

## 3. Architecture

```
com.unsolo.app
├─ UnsoloApp / AppGraph      manual DI (one graph per process), Coil ImageLoader, lifecycle hooks
├─ MainActivity              single activity, splash held until the local landing tab is read
├─ core/
│  ├─ model/ApiModels.kt     @Serializable @Immutable DTOs = contract shapes (camelCase, paise)
│  ├─ net/                   Retrofit ApiService, OkHttp (50 MB cache, client header, auth, 401 refresh), ApiResult
│  ├─ auth/                  TokenStore (Keystore AES-256-GCM), SessionManager, SupabaseAuth (direct /auth/v1)
│  ├─ db/AppDatabase.kt      Room: posts, feed_entries/meta, comments, trips, explore_entries, notifications,
│  │                         chats, messages, outbox, pending_media, events, kv_cache
│  ├─ sync/                  OutboxCore (pure retry/idempotency), Outbox, OutboxExecutorImpl, Workers
│  ├─ image/                 CompressionMath (pure) + ImageCompressor (≤2048 px, ≤2 MB JPEG, EXIF stripped)
│  ├─ analytics/             Room-backed event queue → POST /events (≤50 per call)
│  ├─ push/                  notification channels, FCM service, PushRegistrar
│  ├─ device/                ConnectivityObserver, CoarseLocation (Fused → LocationManager fallback)
│  ├─ prefs/                 DataStore LocalSettings, LandingPolicy (pure)
│  └─ demo/                  DemoBackend, DemoApiInterceptor, DemoImages
├─ data/                     repositories (Account+ConfigStore, Tribe, Explore, Chat, Activity), AppEvents
└─ ui/
   ├─ theme/                 Tokens.kt (generated, not edited), FullCircleTheme (Bricolage, Figtree and Inter via downloadable fonts), PcIcons
   ├─ components/            SeatRing/MiniArc/StoryRing, buttons, tags, bars, sheets, ProgressiveImage
   ├─ nav/                   Routes, DeepLinks (validation), AppRoot (NavHost, bottom bar, sheets, prompts)
   └─ explore, tribe, compose, activity, trips, profile, auth, host
```

### Data flow

The app is offline-first and uses stale-while-revalidate:
- Screens collect Room `Flow`s through repositories.
- ViewModels trigger a network refresh that writes to Room, and the UI updates from there.
- Contract objects are stored as JSON blobs next to the few columns used for queries, so server field changes don't need Room migrations.
- Cold start shows the cached feed without touching the network. The emulator measured about 0.25–0.66 s to first frame.

### Writes and the outbox

Every write goes through the outbox: posts, comments, poll votes, reactions, save, join, withdraw, approve or decline, messages, chat read receipts, notification reads, preferences, `PATCH /me` and `POST /devices`.

1. The UI updates Room optimistically. A post gets `localState = sending`; a message gets a pending bubble keyed `c:<clientId>`.
2. An `OutboxEntity` is inserted. A unique `clientId` makes double-enqueue a no-op.
3. `Outbox.kick()` drains in-process, under a mutex, for instant feedback. `OutboxWorker` also runs in WorkManager as a backstop, with a CONNECTED constraint and exponential backoff.
4. Retry policy (`OutboxPolicy`):

   | Result | Action |
   |---|---|
   | Offline | Retry, and stop draining to keep order |
   | 5xx | Retry |
   | 429 | Retry, honouring `Retry-After` |
   | 409 | Done (idempotent replay) |
   | Other 4xx | Fail permanently |

   Backoff runs 15 s → 30 s → … up to 6 h. After 8 attempts the item fails, and the optimistic UI flips to "Couldn't post · Retry / Discard".
5. Opposite toggles cancel each other while still pending (react then unreact sends nothing). Preference edits merge into one PUT.
6. When the server replies, the local row is replaced by the server copy:
   - Posts: the `local:<clientId>` row becomes the server id.
   - Messages: `c:` becomes `s:` in one transaction.
   - If the moderation result is `held`, the post stays visible only to you, with the money or contact prompt sheet.

### Photo uploads

1. Photos come from the Photo Picker, so no storage permission is needed.
2. Each photo is decoded with `inSampleSize`, scaled to a long edge of at most 2048 px, and has its EXIF orientation applied to the pixels. Re-encoding drops every other tag (GPS, device, time).
3. Each photo is encoded as JPEG, lowering quality first and size second, until it is at most 2,097,152 bytes.
4. The compressed copies are written to app storage.
5. `UploadWorker`, a CoroutineWorker, uploads them as multipart `POST /uploads`. It uses a foreground `dataSync` notification for batches of 3 or more and tracks progress per photo.
6. The feed card shows the local image right away, with a progress ring.
7. When the uploads finish, the outbox sends `POST /posts` with the returned `Media[]`.

### Sync

- `SyncWorker` runs periodically every 15 minutes and once on every app foreground.
- Each run:
  1. Refreshes `/config` (kill switches and min version).
  2. Drains the outbox.
  3. Calls `/sync?since=` and handles the result:
     - Refetches the posts listed in `posts`.
     - Drops the ones in `removedPosts` from every cached feed.
     - Refreshes My trips when memberships change.
     - Refreshes notifications when unread is above 0.
     - Stores `serverTime` as the next `since`.

### Images

- Coil 3 keeps a memory cache (20% of RAM) and a 250 MB disk cache, using a separate OkHttp client without the auth header.
- `ProgressiveImage` paints the inline `lqip` (≤4 KB base64, decoded locally) or the `thumbUrl` first, then crossfades to the full `url`.
- With data saver on, only `thumbUrl` loads.
- Requests are sized to the layout constraints.

### Analytics

- Events are queued in Room and flushed to `POST /events` in batches of at most 50: every 30 s while in the foreground, and through `EventsFlushWorker` when the app goes to the background.
- Each event carries `anonId` (a random UUID kept in DataStore) and `sessionId`, which rotates after 30 minutes in the background.
- Events sent:
  - `app.open`, `screen.view` (explore / tribe / trips / you / trip_detail / post_detail / compose / activity / inbox)
  - `trip.view`, `trip.take_seat`
  - `post.create`, `post.react`, `post.comment`
  - `plan.join_request`, `plan.approve`
  - `share.plan`, `push.open`
  - `landing.prompt_shown`, `landing.prompt_accepted`, `suggestion.tap`

### Landing tab

- Every tab open is counted locally over a rolling 14 days, and also sent as `screen.view`.
- About 1.5 s after launch, the app calls `GET /me/landing-suggestion`. For guests or when offline, it uses `LandingPolicy.localSuggestion`, which mirrors the server rule: the most-opened tab, at least 3 opens, not the current landing tab, a strict winner.
- If a tab is suggested, a sheet asks "You open Tribe most. Start the app on Tribe?". The prompt has a 7-day cooldown.
  - **Accept:** saves the tab locally and sends `PUT /me/preferences {landingTab}`.
  - **Dismiss:** sends `POST /me/landing-suggestion/dismiss`.
- The start destination is the saved local value, read from DataStore while the splash screen is up. It never waits on the network.

### Auth

**Sign-in options** (welcome screen):
- **Email:**
  - Password: `/token?grant_type=password` or `/signup`.
  - 6-digit email code: `/otp`, then `/verify type=email`.
- **Phone:** OTP through `/otp {phone}`, then `/verify type=sms`.
- **Keep browsing as a guest.**

**Tokens:**
- The Supabase session is stored as AES-256-GCM ciphertext. The key never leaves the Android Keystore.
- The ciphertext lives in a private prefs file, excluded from backup and device transfer (`allowBackup=false` plus `data_extraction_rules`).
- `AuthInterceptor` adds `Bearer` only for the API host.
- `TokenAuthenticator` refreshes once on a 401, with a single-flight lock, and signs out when the refresh fails.

**Gates:**
- Posting, commenting, reacting and joining require a session and `isPhoneVerified`. Otherwise the user is routed to `PhoneVerifyScreen` (`/me/phone/start` and `/verify`).

**Sign-out:** calls `DELETE /devices {token}` and Supabase `/logout`, then clears the session and every account-scoped cache.

### Google sign-in

"Continue with Google" is the first option on the welcome screen. It works like this:

1. **Demo mode:** signs in the demo traveller.
2. **`GOOGLE_WEB_CLIENT_ID` set** (from `secrets.properties` into `BuildConfig`):
   - Credential Manager shows the Google account sheet, using `androidx.credentials` with `GetSignInWithGoogleOption` from googleid.
   - The nonce is a random value. Google gets its SHA-256 hex; Supabase gets the raw value.
   - The ID token is exchanged with `POST {supabase}/auth/v1/token?grant_type=id_token {provider:"google", id_token, nonce}`.
3. **Client ID empty, or no Google account or Play services:** Supabase OAuth with PKCE runs in a Custom Tab.
   - The app opens `{supabase}/auth/v1/authorize?provider=google&redirect_to=unsolo://auth-callback&code_challenge=<S256>&code_challenge_method=s256`.
   - Only the configured Supabase host is opened.
   - `MainActivity` catches `unsolo://auth-callback?code=…` and validates the code.
   - The code is exchanged with `POST /auth/v1/token?grant_type=pkce {auth_code, code_verifier}`.
   - The verifier is kept in a private, non-backed-up prefs file for at most 10 minutes and is cleared on use.

### Push

- `UnsoloMessagingService` handles data messages `{type, title, body, link, notificationId, category}`.
- Notifications go on the channels plans, replies (tags are routed here), messages, trips and system, plus an uploads channel for progress.
- **Tapping a notification:**
  1. Opens the validated deep link, as `unsolo://` plus the path.
  2. Sends `push.open`.
  3. Marks the notification read.
- **Without `app/google-services.json`:**
  - The Google Services Gradle plugin is not applied.
  - `Firebase.available()` guards every call, so the app runs without FCM.
- `POST_NOTIFICATIONS` is requested on Android 13+ only after the first successful post or join request, and only once.

### Location

- The app uses coarse location only (`ACCESS_COARSE_LOCATION`).
- Permission is asked only when the user turns on "Suggestions near me" in Settings or taps the "Near you" card.
- `FusedLocationProviderClient` is used with balanced power. Without Google Play services, it falls back to `LocationManager` (network provider).
- Coordinates are rounded to 2 decimals and kept in memory only. They are passed to `/suggestions` and `/feed`.

### Deep links

**Patterns** (declared with `navDeepLink` for `https://unsolo.in`, `https://www.unsolo.in` and `unsolo://`):
- `/tribe` and `/tribe/p/{id}`
- `/packages/{slug}`
- `/profile/{username}`
- `/chat/{roomId}`
- `/bookings`

**Validation:**
- Every destination validates its argument with `DeepLinks`:

  | Argument | Pattern |
  |---|---|
  | id | `^[A-Za-z0-9:_-]{1,64}$` |
  | slug | `^[a-z0-9][a-z0-9-]{0,119}$` |
  | username | `^[A-Za-z0-9_.]{2,40}$` |

  Anything else shows "This link doesn't work".
- Push links are sanitized to relative internal paths: no scheme or host, no `..`, no backslashes, length 200 or less.
- The App Links intent filter uses `autoVerify` against the existing `assetlinks.json`.

### Payments

- "Take a seat" opens `https://unsolo.in/packages/{slug}?book=1` in a Custom Tab themed in paper. Only `unsolo.in` URLs are allowed.
- Balances open `/bookings`.
- No payment SDK is used (that is phase 3).

### Security notes

- No certificate pinning, by design: Vercel rotates certificates. The release network config is HTTPS-only.
- R8 rules keep the kotlinx.serialization serializers, the Retrofit interface and the WorkManager worker constructors.
- **Checked:** a debug-key-signed release APK ran on the emulator with the demo fallback, so serialization works after shrinking.
- No root or emulator checks, and no FLAG_SECURE, as specified.

### Design refinement (Passenger Chart v2, Nov 2026)

This pass follows user feedback that the app "looks more like old Windows UI". The identity stays: paper and ink, gold only for the brand, your seat and HOST, the seat row, and printed vs pencilled. The boxy form look is gone.

- **Seats:** circles, using `PcTokens.seat` (40dp) on detail screens and `seatSmall` (32dp) in feeds.
  - Faces or initials sit on a tonal fill (ink at 7%).
  - Organiser gets a 2dp ink ring; host a 2dp gold ring; you a gold fill.
  - Requested: face at 60% with a clock badge. Held: dashed gold, pulsing. Open: 1.5dp dashed rule2.
- **Corners:** cards 16dp, images 12dp, inputs 14dp, buttons and chips as pills, sheets 24dp. All come from the regenerated `Tokens.kt`.
- **Surfaces:**
  - Printed (hosted) cards are `raisedCard()`: raised paper with a 2dp soft shadow, or a 1dp rule in dark mode.
  - Community plans are `pencilledCard()`: paper with one 1.5dp dashed rule2 outline.
  - There are no ink outlines.
- **Facts:** one icon-and-text row (calendar · pin · people) at 14sp replaces the bordered 3-cell grid.
- **Type:** mono only for prices in rows (15sp or smaller). Big numbers use the condensed face with tabular figures. Labels and tags are sans.
- **Tags:** tinted pills at 11sp semibold (ink 8%, goldBg for HOST).
- **Buttons:** primary is a filled ink pill (52dp); secondary is a tonal pill; tertiary is text. There are no outline buttons.
- **Navigation:**
  - Bottom bar: Material 3 style, with a pill indicator and a hairline top border. Post is a filled ink rounded button.
  - Filter and category tabs are pill chips.
  - The segmented control is a tonal track with an ink pill.
- **Layout:**
  - 20dp page gutters (`Gutter`), with 10–12dp gaps between cards instead of full-width rules.
  - Settings, forms and included-lists are grouped in `FormCard`s with inset dividers.
  - Story avatars have a thin 2dp ring.

### Design system (Full Circle)

> The app now uses the Full Circle design (see [design-system.md](design-system.md)). The rest of this section describes Passenger Chart and is kept for reference.
>
> - The seat ring (`ui/components/SeatRing.kt`) is a continuous open track. Taken spots form one ink arc, your spot is gold and plans use hollow circles.
> - The centre label is "8/12 spots left".
> - User-facing copy says "spot". The CTA is "Grab a spot".
> - Every photo goes through `ProgressiveImage`: the LQIP or thumb paints first, then the full image crossfades in. A Supabase `…/x.webp` gets its thumb from `…/x_thumb.webp`.
> - Decisions are logged in `.oil-ui/full-circle/decisions-android.md`.


**Theme and type:**
- `PassengerChartTheme` maps `PcTokens.Light` / `PcTokens.Dark` from the generated `Tokens.kt` and follows the system dark setting.
- Material3 is used only for plumbing: the sheet, the date picker, ripples.
- Type uses downloadable Google Fonts:
  - IBM Plex Sans Condensed for titles
  - Plex Sans for body
  - Plex Mono for numbers and codes
- Fallbacks are Roboto Condensed, Roboto and monospace.

**Components:**
- **Seat cell states:**

  | State | Look |
  |---|---|
  | Host | Gold bottom bar |
  | Organiser | Heavier ink outline (the ink ORGANISER tag sits next to the name) |
  | Member | Face or initials; a generic glyph for guests, who get no faces |
  | You | Gold |
  | Requested | Ink outline with a clock badge |
  | Held | Dashed gold, pulsing |
  | Open | Dashed rule |

  Rows with more than 16 seats collapse to "18 of 24" with a bar.
- **Printed vs pencilled:**
  - Hosted trips use solid rules, a mono price and an ink "Take a seat" button.
  - Plans use dashed rules, the line "Community plan · not a booking", cost as body text and an outline "Ask to join" button.
- **Gold** is used only for the wordmark, your seat, the HOST tag and the gold-at-18% selected background.

## 4. Screens

| Area | Screens |
|---|---|
| Explore | Wordmark header with messages, activity and avatar. Search pill opens a search screen. Trips / Stays / Activities / Rentals tabs. "Leaving next" hero (seat row, chart cells, price, Take a seat). Tribe bridge row ("14 people are planning Manali", from `planningCount`). "For you" rail with a Near you card. Ruled departures board with seat strips. |
| Trip detail | Photo pager, chart cells, title and description, seat row, host row, departure picker, includes, "From people who went" stories rail, bridge row, sticky price bar with Take a seat (Custom Tab). |
| Tribe | People strip, For you / Plans / Stories / Asks. Plan, story (photos first plus a HOSTED TRIP · BOOKABLE card), ask (poll) and placed-trip cards. Local states (Posting… with a progress ring, Held, Failed with Retry/Discard). "You're caught up" plus the next 3 departures; no infinite scroll past the end. |
| Post | Type sheet (Plan / Story / Ask, plus a HOST note that points to Hosting). |
| Plan composer | Title, where, date range (past dates disabled), group stepper, rough cost, who can join (verified / women / anyone, with ID-verification rules), meeting point, about, photos, live pencilled preview, single bottom primary button. |
| Story composer | Photos (cover), title, "Which trip?" from past bookings or a place, tag who went (consent copy), show on trip page, story text. |
| Ask composer | Question, place, details, optional 2–4 option poll. |
| Post detail | Plan: chart cells, seat row, cost and meeting-point copy, safety tip, organiser requests block, host-offers entry, comments, join sheet with a required intro (seat turns requested at once), Withdraw. Story and ask: photo pager, 3 reactions (Want to go / Helpful / Love, counts only), hosted-trip card, poll voting, one-level threads with reply, delete and report, comment bar. Menu: share, report, block, cancel plan. Held posts: Edit and resubmit, or List as hosted trip. |
| Activity | All / Requests. Unread dots, mark read, mark all. Inline Review / Approve all for join requests, See offer for host offers. Requests tab lists your organised plans with approve and decline. |
| Messages | Chats / Requests segments plus a requests section and note. Chat room has an optimistic send keyed by clientId, a 4 s → 15 s poll, read receipts, retry on failure, grouped bubbles, HOST tag, and report or block on long-press or the flag. |
| My trips | Ticket stubs (days to go, booking code, balance and paid chip, trip chat with unread count). Dashed plan tickets (organiser tag, seat cells, plan chat). Requested plans. "Last trip · Post story" prompt. Past tab. |
| You / Profile | Header with avatar, verified mark and HOST tag. Settings and Hosting (own) or Message and report/block (others). Stats. Posts / Plans / Trips tabs (grid, dashed plan rows, trip log). |
| Settings | Landing tab, push categories and quiet hours, suggestions near me, suggest by gender, gender (optional), interests, data saver, phone verification, leaderboard (web), sign out, privacy. |
| Auth | Welcome, email (password or code, forgot password), phone OTP, guest, demo traveller (demo only), phone verification for existing accounts. |
| Host | "Plans looking for a host", offer form (price, includes chips plus custom, extra seats, note), organiser offer review (pager, accept or decline, accepted state with pay-by and trip link). |
| System | Offline banner, demo banner, min-version "Update UnSOLO" screen, invalid-link screen, landing prompt, notification-permission moment. |

**Screenshots** are in `mobile/android/screenshots/`. The refined (v2) look is in `screenshots/v2/`. They were taken on an API 35 AOSP emulator (no Google Play services, so the system fallback fonts show instead of Plex). They include:
- `explore`, `trip_detail`, `tribe_feed`
- `plan_composer`, `plan_composer_preview`
- `plan_detail_requested`
- `activity`, `my_trips`, `settings`
- `inbox`, `chat`, `held_prompt`, `landing_prompt`
- `offline_cold_start_tribe`
- `dark_*`
- `release_build_explore`

## 5. Tests

`./gradlew :app:testDebugUnitTest` runs 33 tests, all passing:

| Suite | Tests | What it checks |
|---|---|---|
| `CompressionMathTest` | 7 | inSampleSize, target size, quality-before-scale loop, never over 2 MB, impossible case |
| `OutboxProcessorTest` | 9 | duplicate clientId ignored; lost response retried safely (the server keeps 1 object); backoff gating and growth; give-up after 8 attempts; offline stops the drain in order; permanent errors; Wait doesn't count; contract error mapping (409, 429 Retry-After, 5xx, 4xx, 426) |
| `LandingPolicyTest` | 9 | the 14-day window, at least 3 opens, ties, current tab, server answer wins, dismissed and cooldown, invalid server tab |
| `AuthCryptoTest` | 4 | PKCE S256 against the RFC 7636 test vector, nonce SHA-256 hex, URL-safe randomness, auth-code validation |
| `SameSiteLinkTest` | 1 | Only same-site notification and push paths are followed |
| `DeepLinksTest` | 3 | contract paths, hostile input rejected, min-version comparison |

**Checked by hand on the emulator:**
- Cold start offline (airplane mode).
- Sign-in, then ask to join (seat turns requested, then the notification permission prompt).
- Publishing a plan (Posting…, then the server copy).
- A held ask, its prompt, then edit and resubmit.
- Inline approve.
- Chat send and the polled reply.
- Landing prompt, then accept, then a cold start lands on Tribe.
- Dark mode.
- A release build under R8.

**Not checked:**
- FCM (no `google-services.json`).
- Fused location (no Google Play services on the image).
- Photo uploads with real images (the emulator gallery is empty). The pipeline compiles and its maths is unit-tested.

## 6. Inputs needed from the team

| Input | Why |
|---|---|
| `app/google-services.json`, plus an FCM service account on the server | Push. The plugin is applied automatically when the file exists. |
| Release keystore (upload key) and `keystore.properties`, or Play App Signing | Signed release builds. Not configured: `*.jks` and `keystore.properties` are gitignored. |
| Play Console app `com.unsolo.app` with an internal testing track | Distribution (product spec rollout, weeks 3–4) |
| Google **Web application** OAuth client ID, set as `GOOGLE_WEB_CLIENT_ID` in `secrets.properties` (same client as Supabase → Auth → Providers → Google) | Native Google sign-in through Credential Manager. Without it, the app uses the Custom Tab fallback. |
| Google **Android** OAuth client for `com.unsolo.app` with the SHA-1 of the upload and Play signing certs (`./gradlew signingReport`) | Credential Manager rejects the app without it |
| `unsolo://auth-callback` in Supabase → Auth → URL Configuration → Redirect URLs | The PKCE Custom Tab fallback |
| Supabase URL and anon key | Served from `/config` (preferred), or put in `secrets.properties` |
| Supabase phone provider (2factor, MSG91 or Twilio) | Phone OTP sign-in and `/me/phone/start` in production |
| SMTP sender for email codes | Email OTP |
| `assetlinks.json` SHA-256 for the release signing cert | App Links `autoVerify` with the real key |
| A test device with Google Play services | To confirm downloadable Plex fonts and the font cert array (copied from the standard template), fused location and FCM |

## 7. Contract gaps

These are things the mockups or this brief need that api-v1 doesn't define. The app does not invent server behaviour for any of them.

1. **No "plans looking for a host" endpoint.** The host hub uses `GET /feed?kind=plan` and filters client-side. Suggestion: `GET /host/plans` or `/feed?kind=plan&lookingForHost=1`.
2. **Plan chats:**
   - `Post` has no `chatRoomId`, so "Plan chat" rows open the inbox.
   - Chat `type` has no `plan` value. The fixtures use `trip` for plan groups.
3. **Notifications have no structured payload** (actor, postId, userId), and `type` values aren't listed.
   - Inline approve parses `link` and calls `/posts/{id}/requests`.
   - The app assumes `plan.join_request` and `plan.host_offer`.
4. **`/sync` → `notifications`:** the type (count or list) isn't defined, so it's kept raw.
5. **Held posts:**
   - There's no "confirm non-commercial" action.
   - It isn't stated whether `PATCH /posts/{id}` re-screens and returns `{post, moderation}`. The app assumes the same shape as `POST`.
6. **`PUT /me/preferences` partial semantics** (shallow or deep merge) aren't defined. The app always sends nested objects (`notify`) whole.
7. **No follow or unfollow endpoints**, although `isFollowing` and `followers` exist. The Follow button is omitted and Message is shown instead.
8. **Booking handover:**
   - It isn't specified how the session is "handed over with a deep link" to the Custom Tab. The user may have to sign in again on the web.
   - There is no departure-date parameter for `?book=1`.
9. **Trip detail fields** shown in the mockups are missing: itinerary ("Day by day"), pace, route or departure city, cancellation tiers, chat preview, group mix ("4 women · 3 men").
10. **`Booking`** has no seat number or pickup point (the ticket stub shows "Seat 08").
11. **Stays and rentals:** `TripLite` has no price unit (per night or day) or category field.
12. **Status stories** (the round avatars on Tribe) aren't in the contract. The app shows recent feed authors there.
13. **Comment reactions** ("Helpful · 4" on a comment) aren't in the contract and are omitted.
14. **Polls:**
    - A vote is a comment with `pollChoice`. It isn't stated whether `body` is required for a vote; the app sends the option label.
    - There is no poll closing time.
15. **Message requests** (DMs from non-followers): there are no accept or decline endpoints.
16. **`HostOffer`** has no host stats ("14 Kalga trips · 4.8"). The offer form's "Keep the group's dates" has no field.
17. **Ask composer "Who gets asked" counts** aren't in the contract and are omitted.
18. **Tagging people on stories** needs a user search or "people on this trip" endpoint. The app uses the trip's `goingFaces`.
19. It isn't stated whether a **Supabase phone-OTP sign-in** sets `isPhoneVerified` on the profile. The app re-reads `/me` after sign-in.
20. **Feed `place` filter:** the semantics (slug or name) aren't defined. The "All places" chip isn't built yet.

## 8. Known limitations

- **Fonts on the emulator:** the AOSP image has no Google Play services, so screenshots use Roboto Condensed, Roboto and Droid Sans Mono instead of IBM Plex. Plex loads on Play devices.
- **Font certificate array:** it was typed from the standard template and hasn't been checked on a Play device yet.
- **Untested paths:**
  - Push needs `google-services.json`.
  - The FCM token-to-`POST /devices` path is in place but untested.
  - The foreground notification for upload batches is untested.
- **Not built yet:**
  - Place picker (free text only) and "All places" filter.
  - Explore month filter.
  - Map.
  - Image messages in chat.
  - Baseline profile module.
  - Accessibility audit with TalkBack. Icons have content descriptions, and touch targets are 44dp or more.
- **Demo backend:** its state resets when the process restarts (see section 2).
- **Screenshots:** they are from the final build except `plan_detail*.png` and `plan_composer*.png`. Those were taken before the Messages and Activity icons were added to detail top bars.
- **Payments:** stay on the web, by design for P2.
