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

## Density pass (user request)

You found photos, cards and type bigger than other sites. I measured Airbnb and MakeMyTrip in the browser at 1440px and scaled Full Circle to about 0.85× everywhere. The full table is in [design-system.md](design-system.md#density).

- **Type:** web body is 15px (it was 16). The apps' tokens shrank one step (body 14, titles 22/18/15).
- **Cards:** photos are 16:10 instead of a fixed height, rings are 72px (they were 88–100), titles 15px (they were 17–19), and buttons and chips are smaller.
- **Layout:**
  - "Leaving soon" shows 5 cards per row at 1440px (it showed 4), and up to 6 on wider screens. Hidden extras keep every row full.
  - Results grids gain a column.
  - Listing rows show about 6 cards across a desktop (they showed about 4.8), and about 1.6 on a phone.
- **Shape:** card radius 20 (was 28), image radius 16 (was 20), sheets 24, tab bar 60.
- **Touch targets stay at least 44px.**
- **Fix: clipped Leaving soon cards on smaller desktops.**
  - Five fixed columns left each card about 210px at 1280px wide, so titles, captions and the button were cut off.
  - The grid now picks 2–5 columns from its own width (container queries), so a card is never under about 250px. It always shows two full rows.
  - Cards adapt to their own width: titles wrap to two lines, the caption truncates, and the "Grab a spot" pill hides below 236px (the whole card is the link).
  - Checked from 800px to 1920px: no overflow.
- **The rest of the home page got the same pass:**
  - "Trips by vibe": 3 per row, 6 on wide screens.
  - Region tiles, host and review cards, the leaderboard and "How UnSOLO works" are all about 0.85×.
  - The gaps between sections are smaller.
- **On phones,** "Next few weeks" now starts above the fold on Explore.

## Review round 4 (user request)

- **Wording: "spot", not "seat".** Rings, captions and buttons all say spot: "8/12 spots left", "12 spots open", "Grab a spot", "Request a spot". Code names (`seats`, `SeatRing`) are unchanged.
- **Rings are a simple progress ring again.**
  - The per-seat markers are gone, since they clutter rings with 20 or more spots.
  - Taken spots draw as one continuous arc over the thin open track. *You* stays its own gold arc.
  - There is no chair icon.
  - Every trip ring uses one centre label (`spotsCenter`): a big number, a tiny "/12" beside it, and "spots left" under it, or "12/12 full". It fits inside the disc on the trip page, where "of 12 seats left" used to clip.
  - Card captions no longer repeat the ring: "3 going", "Be first in the circle" or "Full".
- **No visible "Find your circle" title.** On desktop the search panel leads; on mobile the category chips sit under the top bar. The heading stays for screen readers.
- **Plan invite, simplified:**
  - The animated ring, the looping seat fill and the pulsing + are removed.
  - The whole card opens the plan composer, with a + circle as the cue. "N planning in Tribe →" with real faces is a separate link into Tribe.
- **Photos load low-res first.** Every upload already stores a 320px `_thumb.webp`.
  - Cards, the trip cover and gallery, listing heroes, "Trips by vibe" tiles and the story viewer paint that thumb at once, and the full photo covers it when it arrives (`LowResUnderlay`, no JavaScript).
  - Cards now load the full photo resized by Next instead of only the 320px thumb, so they are sharp on retina screens too.
  - The apps already did thumb-first; every photo there now goes through it.
- **Bug: stays, rentals and activities search was still empty.** Real cause: the query asked for `compare_at_price_paise`, which exists only on `packages`. PostgREST rejected the whole query, and the error was swallowed into "0 results". This affected `main` too. The column is removed, and a test now checks every selected column against the `service_listings` migrations.
- **One upcoming-trips section, not two.** The older "Departing soon / Popular trips" row repeated "Leaving soon" and "Next few weeks", so it's hidden while trips lead the page. It returns, in its usual place, when Stays, Activities or Rentals are picked, since "Leaving soon" is hidden then.
- **"Leaving soon" loads faster.** Its data, and the plans row next to it, were fetched fresh on every home load (about three database round trips each). They are now cached for 60 seconds, like the rows below. They are public and cookie-free; seat counts are aggregates and include no faces. The loading skeleton now matches the real grid.
- **Hydration fix:** the "How UnSOLO works" panel renders after hydration, since sign-in state is only known in the browser. It caused a mismatch on every home load.

## Review round 3 (user request)

- **Wordmark:** plain ink "UNSOLO" in the original type, Inter Black with tight tracking, as on `main`. There is no gold "UN" anymore, on web or in the apps.
- **Less text:** the hint lines under "Find your circle" and "Leaving soon" are removed.
- **Seats you can read at a glance:** trip rings at 64px and larger show one marker per open seat, plus a seat icon with "N seats left" in the centre.
- **Plans section:**
  - It now renders once per breakpoint. It was duplicated on desktop when there were no plans.
  - It leads with a "Going somewhere? Post a plan." invitation: a plan ring with your seat in yellow, whose other seats fill in on a loop, plus a pulsing +. Motion stops under reduced motion.
  - The invitation also links into Tribe with the count of people planning.
- **Bug: the stays, rentals and activities search pages were empty, on production too.**
  - Cause: the search page read listings with the anonymous Supabase client and got 0 rows. The home rows use the service-role client.
  - Fix: the search query now uses the same server-side client, with the same "active and approved" filters.
  - The "blink" was the instant preview, filled from the home rows, before the empty server result replaced it.
- **Home categories:** choosing Stays, Activities or Rentals on the home page hides the trip-only sections, so that category's listings lead. Switching the desktop search tab reorders the rows immediately.
- **Search results page:**
  - Trip cards (`TripCardView`, also used by the home "Popular trips" rows) are now Full Circle cards: photo first, seat ring, date chip and save heart. They show one per row on phones.
  - Category tabs and filter chips are ink pills, and the filter panel is a 28px card.

## Yellow only where it's essential (user request)

The rule was tightened after review against Airbnb and MakeMyTrip, which use colour sparingly.

**Yellow (`.pc-btn-sun`, shadcn `brand`) is kept for:**
- the one main action on a screen: "Grab a spot" in the trip page's bottom bar, "Request to join" in a plan's bottom bar, Publish, the Explore search button, "Show trips" in the search sheet, and "Join free" for signed-out visitors;
- the centre **+** button;
- your own seat on the ring;
- the HOST badge;
- the + on your own story. Story rings are ink when unseen and grey when seen.

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
| **Open spots** are one continuous thin track, never dashed. Taken spots are one continuous arc (a progress ring), with the count in the centre: "8/12 spots left". | You disliked dashed outlines and, later, per-seat markers (clutter on big trips). The centre number says how many are left. |
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
- Detail pages hide the tab bar and pin their primary action at the bottom: Grab a spot, Request to join, the comment box.
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
