# Full Circle rollout: decisions

This branch, `main_revamped_v2`, implements the approved Full Circle direction on web (desktop and mobile), Android and iOS. The previous Passenger Chart design is kept on `main_revamped`.

- The spec is in [design-system.md](design-system.md).
- Per-platform working notes and screenshots are in `.oil-ui/full-circle/`, a local folder that is not committed.

## Shared rules (all platforms)

| Decision | Why |
|---|---|
| **Seat count:** n = `seatsTotal` (`max_group_size`), taken = `seatsTotal − seatsLeft`, and the host is only the badge, not a seat. The trip API lists the host as an extra seat; rings drop it. | Bookings never include the host. Counting the host made "5 of 11" on one platform and "5 of 12" on another. |
| **Who sees faces:** signed out, anonymous arcs; signed in, initials; co-travellers on the same departure, photos. On web the photos are removed on the server. | The approved privacy rule. Women's photos are not exposed to strangers. |
| **Open seats** are one continuous thin track, never dashed. Large rings get small seat markers so open seats can be counted. | You disliked dashed outlines. An independent review found that empty rings read as "nothing". |
| **Gold means *you*:** your seat, your poll vote and your story ring. The mockup showed the poll vote in pine. | Gold is reserved for you, the host and the wordmark. |
| **Thumb reach** (mobile web, Android, iOS): see the list after this table. | Your request. The most-used actions are in the bottom third. |
| **Explore leads with people and departures:** "Leaving soon" photo-first ring cards, then the departures list, then plans looking for people. The marketing hero is gone. | The approved direction. The old hero showed zero stats when empty. |
| **Key names stay:** token names (`paper`, `ink`, …) and the web `pc-` class prefix are kept and given new values. | Three codebases compile against them. Restyling moves every screen at once, with no rename churn. |
| **Legacy colours:** the legacy web `blue-*` colours map to a pine scale. | Older admin and host screens used blue for "info" and "verified". |
| **Fonts:** web uses Figtree through `next/font` and Bricolage Grotesque through a Google Fonts stylesheet. Bricolage's multi-axis font files broke `next/font`'s build-time download on Vercel. Android uses Google downloadable fonts with a system fallback. iOS uses SF Pro Rounded and SF Pro. | No font files are added to the repo. iOS can't use downloadable Google fonts. |
| **Icons:** web uses lucide and iOS uses SF Symbols (bold). Android uses inline vectors redrawn at a bold weight. | No new icon dependency was added. |

The thumb-reach layout:

- A 68px tab bar with a raised **+** in the centre, which opens "What are you sharing?".
- Explore search docked at the bottom.
- Detail pages hide the tab bar and pin their primary action at the bottom: Take a seat, Request to join, the comment box.
- Composers put **Publish** at the bottom.

## Built without backend support (device or client only)

- Saving a trip (apps): stored on the device. There is no trip-save endpoint.
- Seen stories: stored on the device or in the browser.
- Search filters: date window, price and "open seats only" run on the loaded results.
- Questions vs Polls and Saved filters (web): filtered on the client.
- Story replies: they post as comments (web, Android) or as a direct message to the author (iOS). Quick reactions use the three real reaction kinds instead of emoji.
- Chat rings in Messages (Android): matched from bookings and plans. A `postId` or seat counts on chat summaries would make this exact.

## Left out (needs backend)

- Seat hold timer ("Held · 9:59"). The held state is drawn if the API sends held seats.
- Waitlist "Notify me". Full trips show the button, and it links to the trip page.
- 24-hour Status and the story camera.
- Poll extras: closing time, posting into a trip group, anonymous votes.
- Departure-city ("From my city") filter.
- Pinned host note in trip chats. Shown as "Latest from the host" instead.
- Chat attachments and voice.
- Comment likes.
- Desktop comparison view.

## Local preview (development only)

`.env` points at a placeholder Supabase project, so nothing renders locally without these. In production they return 404 or are never reached.

- **Web:**
  - `/dev/img/*` serves sample photos from `.oil-ui`.
  - `DEMO_TRIPS` and `demoPackage()` fill Explore and `/packages/<demo-slug>`.
  - The Tribe demo posts were expanded.
- **Apps:** demo mode, as before.

## Checks run

- **Web:** `tsc` is clean. vitest passes (92 files, 769 tests). ESLint is clean on the new and changed code; the remaining errors are older ones in lines this change didn't touch. Checked in the browser at 375px and 1440px, in light and dark mode.
- **Android:** `assembleDebug` and `testDebugUnitTest` pass (38 tests, including new ring-geometry tests). Screens were checked on the API 35 emulator. The emulator has no Play services, so the screenshots use the fallback font. Animations were off, so the motion wasn't seen running.
- **iOS:** `xcodebuild` build and tests pass (66 tests) on the iPhone 17 Pro simulator.
- **Independent visual review (web):** 7/10. The top fixes were applied: opaque bottom bars, title under the ring, gallery gap, CTA wording, full-width desktop search, open-seat markers, and sold-out in deep gold.
