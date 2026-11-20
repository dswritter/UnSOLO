# UnSOLO cross-platform architecture

UnSOLO ships three native clients on one backend:

| Client | Technology | Location |
|---|---|---|
| Web (desktop and mobile web, installable as a PWA) | Next.js 16 | `src/` |
| Android | Kotlin + Jetpack Compose | `mobile/android/` |
| iOS | Swift + SwiftUI | `mobile/ios/` |

All three use the same Supabase Postgres (with RLS), Supabase Auth, the shared **`/api/v1`** contract ([api-v1.md](api-v1.md)) and the same design tokens (`design/tokens.json`).

```
            ┌──────────── Supabase Auth (email+password, email OTP, phone OTP, OAuth)
 Web ───────┤
 Android ───┼── HTTPS ──► /api/v1 (Next.js route handlers, Vercel bom1)
 iOS ───────┘                │  zod validation · rate limits · screening · ETags
                              ├──► Postgres (RLS as the caller; service role only for counts/pushes)
                              ├──► Storage (WebP full + 320px thumb + LQIP)
                              └──► Push fan-out: FCM · APNs · Web Push (node:crypto only)
```

## Principles

- **One contract.** The web pages, Android and iOS read the same JSON models. The web renders its first page on the server with the same loaders (`src/lib/tribe/load.ts`) and then switches to `/api/v1`.
- **The database enforces the rules.**
  - Who can post, join, approve, offer or see a meeting point is enforced in RLS policies and guard triggers (migrations 119–121), not only in the UI.
  - The API adds friendly errors, rate limits and text screening on top.
- **Optimistic and offline-first.**
  - The UI updates first (seat pencilled in, reaction flipped, message bubble shown) and reconciles with the server response.
  - Writes carry a client-generated `clientId`, so retries from an outbox are idempotent:

    | Platform | Outbox | Replays on |
    |---|---|---|
    | Web | localStorage | `online` |
    | Android | Room + WorkManager | Network available |
    | iOS | SwiftData + BGProcessingTask | Network available |

  - `GET /sync?since=` tells caches what to refetch or drop.
- **Fast loading.**
  - **Server:** ETags and `s-maxage` on public GETs.
  - **Web:** the service worker caches static assets and images, and never caches private pages.
  - **Images:** LQIP (low-quality placeholder) or thumbnail first, then the full image. Data saver loads thumbnails only.
  - **Native:** HTTP caches (OkHttp / URLCache), image disk caches, and the start tab is cached locally so a cold start never waits on the network.
- **Images under 2 MB.**
  - Clients downscale to a 2048 px long edge and lower quality until the file is 2 MB or less, stripping location metadata.
  - The server re-validates by content, re-encodes to WebP and stores the full image, a thumbnail and an LQIP (`src/lib/images/process.ts`).
  - Uploads run in the background while the UI shows the local preview.
- **Privacy.**
  - Location is opt-in and rounded to about 1 km.
  - Gender is optional and used only for women-only plans and opt-in suggestions.
  - Contact details are masked in posts.
  - Meeting points are visible only to approved members.
  - Sign-out clears device caches and push registration.
- **Control.**
  - Kill switches and rollout live in `platform_settings`, edited from Admin → App controls and read via `/config`.
  - Every moderation decision is written to `moderation_actions` and `audit_logs`, and the affected user is told why.

## Where things live

| Concern | Web | Android | iOS |
|---|---|---|---|
| Design tokens | `src/app/tokens.generated.css`, `passenger-chart.css` | `ui/theme/Tokens.kt` (generated) | `DesignSystem/Tokens.swift` (generated) |
| API client | `src/lib/api/client.ts` | Retrofit/Ktor + OkHttp | URLSession |
| Offline store | localStorage outbox + SW cache | Room | SwiftData |
| Background work | Service worker | WorkManager | BGTaskScheduler + background URLSession |
| Push | Web Push (`public/sw.js`) | FCM | APNs |
| Location | `navigator.geolocation` (coarse) | FusedLocationProvider (coarse) | CoreLocation (reduced accuracy) |
| Analytics | `src/lib/analytics/client.ts` | Room-queued batches | Disk-queued batches |

Each app's README section (`android.md`, `ios.md`) covers its build, run and demo mode.
