# Full Circle rollout: decisions

This branch, `main_revamped_v2`, implements the approved Full Circle direction on web (desktop and mobile), Android and iOS. The previous Passenger Chart design is kept on `main_revamped`.

- The spec is in [design-system.md](design-system.md).
- Per-platform working notes and screenshots are in `.oil-ui/full-circle/`, a local folder that is not committed.

## Palette update (user request)

The dark-green base and green buttons were dropped. The palette is now **UnSOLO yellow (`#FCBA12`)** plus shades of white, black and yellow.

- **Yellow is the fill:** buttons, selected chips and the + tab, always with black text on it.
- **Dark gold `#7A5800` is accent text**, because yellow text on white is only 1.7:1.
- **Taken seats are ink**, so the yellow *you* arc stays distinct.

The token key `pine` is kept for compatibility and now holds the yellow. Two tokens were added: `accentInk` and `taken`.

## Yellow only where it's essential (user request)

The rule was tightened after review against Airbnb and MakeMyTrip, which use colour sparingly.

**Yellow (`.pc-btn-sun`, shadcn `brand`) is kept for:**
- the one main action on a screen: "Take a seat" in the trip page's bottom bar, "Request to join" in a plan's bottom bar, Publish, the Explore search button, "Show trips" in the search sheet, and "Join free" for signed-out visitors;
- the centre **+** button;
- your own seat on the ring;
- the HOST badge;
- unseen story rings.

**Everything else is black, white or grey:**
- the default `.pc-btn` and shadcn Button are ink;
- trip-card CTAs are quiet grey pills;
- selected chips and tabs are ink;
- tags are grey;
- the header "Post" button is an ink outline;
- send buttons, switches and your own chat bubble are ink.

Older admin and host screens that already used yellow buttons before the revamp are unchanged.

**Desktop width:** the navbar, footer and every Explore section share one centred 1440px container with side padding, instead of running full width.

## Explore listings (user request)

- **"Trips by vibe" tiles are 16:9.** They were 4:5, which cropped hosts' landscape photos. On mobile they are a sideways-scrolling row; on desktop, 3 per row.
- **Same width for every section:** "Find your circle", "Leaving soon", "Next few weeks" and the plans section use the same centred 1440px container as the listing rows, the navbar and the footer. "Leaving soon" shows 4 cards per row on wide screens.
- **"New" is computed.** It marks the 6 most recently published listings of each type (stays, rentals, activities), by first approval time. When a new listing is published, the oldest of those 6 loses the badge (`src/lib/listings/newest.ts`, with tests). It shows as a pill on the photo. Cards without reviews no longer have a "★ New" text line.

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
