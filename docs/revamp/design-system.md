# Full Circle design system

Every trip is a circle of people you can see into before you join.

This replaces Passenger Chart. The older design is kept on the `main_revamped` branch.
The visual reference is the mockup page in `.oil-ui/full-circle/mockups.html`. It is a local working file and is not committed.

**Source of truth:** `design/tokens.json`. Run `node scripts/gen-design-tokens.mjs` to regenerate the token files for each platform:

| Platform | Generated file |
|---|---|
| Web | `src/app/tokens.generated.css` (`--pc-*` variables) |
| Android | `mobile/android/app/src/main/java/com/unsolo/app/ui/theme/Tokens.kt` |
| iOS | `mobile/ios/UnSOLO/DesignSystem/Tokens.swift` |

Don't edit the generated files by hand.

The token *names* are kept from Passenger Chart so existing code keeps compiling:
- `paper` is the base, `raised` is the surface, `ink` is the text colour, `rule` is the border.
- `blue` is now the link colour, which is pine.
- New roles: `pine`, `onPine`, `pineSoft`, `tonal`, `seatOpen`, `rose`, `roseSoft`, `roseOpen`, `full`, `selected`, `scrim`.

## Look

| Role | Light | Dark |
|---|---|---|
| Base (`paper`) | `#FAFAF7` | `#0F0F0F` |
| Surface (`raised`) | `#FFFFFF` | `#1A1A1A` |
| Text (`ink` / `ink2` / `ink3`) | `#111111` / `#55524C` / `#6B6760` | `#F5F3EE` / `#B5B1A8` / `#8F8B82` |
| Border (`rule`) | `#E7E4DD` | `#2C2B28` |
| Primary fill (`pine`, name kept), with text on it (`onPine`) | `#FCBA12` UnSOLO yellow, `#111111` | `#FCBA12`, `#111111` |
| Accent text, links (`accentInk`) | `#7A5800` | `#FCBA12` |
| Taken seats (`taken`) | `#111111` | `#F5F3EE` |
| Open seat (`seatOpen`) | `#8F8B82` | `#6B6860` |
| Women only (`rose`) | `#C9466A` | `#E36C8D` |
| Sold out (`full`) | `#B07A00` | `#E0A526` |

- **UnSOLO yellow** is the primary *fill*: buttons, selected chips, the + tab, your own chat bubbles. It always carries black text. It is never used as text, an icon or a line on a light surface (1.7:1). Accent text uses `accentInk`.
- **Seats:** taken seats are ink arcs. *You* is the yellow arc with an ink under-stroke, so it stays distinct. The HOST badge is yellow.
- **Outline buttons, focus rings and selected outlines** are ink.
- Older names in this doc ("pine") refer to the `pine` token, which is now the yellow primary fill.
- **Rose** always comes with the "Women only" label and an icon.
- **Type:**
  - **Bricolage Grotesque 800** for headings and prices.
  - **Figtree 400/600/700** for body, labels and buttons. Numbers use tabular figures.
  - The ₹ sign falls back to the system font.
  - **iOS** uses SF Pro Rounded (heavy or bold) for display text and SF Pro for body, so the app bundles no font files.
  - **Android** uses Google downloadable fonts for Bricolage and Figtree, with the system font as fallback.
- **Shape:**
  - Buttons are pills, 52px tall for primary actions and 40px for small ones.
  - Cards have a 28px radius and a 1px `rule` border, with no shadow. Images have a 20px radius.
  - Sheets have a 28px top radius.
- **Press** scales to 0.97. Under Reduce Motion, every motion becomes a fade.
- **Icons:** Phosphor Bold on all platforms. Web and Android use Phosphor. iOS uses the closest SF Symbols at `.bold` weight.

## The seat ring (signature component)

N arc segments sit around a circular centre: a trip photo, an organiser's face, or a tinted disc.

**Geometry**, matching `ring()` in the mockups. Angles are in degrees, with 0 at 3 o'clock, going clockwise.
- `S` is the size. `pad = S < 90 ? max(3, S*0.06) : max(14, S*0.085)`, `R = S/2 - pad`.
- Stroke widths: taken `wT = max(4, S*0.05)`, open `wO = max(2, S*0.016)`.
- Host badge gap, only when a host or organiser badge is shown:
  - `d0 = clamp(12, S*0.14, (2πR/n)*0.6)`
  - `hostGap = min(150°, 2*asin(min(1, (36 + d0/2 + 4)/R)))`
- Segments:
  - `span = 360 - hostGap`, `seg = span/n`, `gap = min(6, seg*0.24)`, `start = -90 + hostGap/2`.
  - Segment i runs from `a0 = start + i*seg + gap/2` to `a1 = a0 + seg - gap`.
- **Open spots:** one *continuous* thin track in `seatOpen` from `start + gap/2` to `start + span - gap/2`. Never dashed, no per-spot markers.
- **Taken spots:** a thick round-capped arc over the track, in `taken` (ink). Consecutive taken spots merge into *one* arc, from the first one's `a0` to the last one's `a1`, so the ring reads as a progress ring at any group size. It is `rose` on women-only trips and `full` when every spot is taken.
- **You:** a `gold` arc drawn over a `wT + 3` stroke in `ink`. *Held* is the same arc dashed, with "Held · 9:59".
- **Seat dots:** taken and you seats get a dot at the arc midpoint when `d = clamp(12, S*0.12, segLen*0.5) >= 14`.
  - The dot shows a face or initials and has a 2px `raised` halo.
  - Faces are shown only to co-travellers.
  - Signed-in viewers see initials. Signed-out viewers see no dots, just arcs.
- **Centre disc:** radius `r0 = max(2, R - wT/2 - (S < 90 ? max(2, S*0.05) : max(6, S*0.045)))`. It holds the photo, or `tonal` (or `goldBg` when full).
- **Centre label (trip rings):** the spots left as a big number, a tiny "/12" beside it (0.36× size, 60% opacity), and "spots left" / "spot left" under it. When full: "12/12" and "full". No icon. On a photo it sits on a pill-shaped scrim. User-facing copy always says *spot*, never *seat*.
- **Host badge:** a pill at the top (`top = pad - 13`) with the host's avatar and "Host" (gold) or "Organiser" (ink).
- **Plans** (community, no money): no continuous track. Open seats are hollow circles (`raised` fill, `seatOpen` 2.5px stroke) at each segment midpoint. The centre is the organiser's photo.
- **Requested:** your face waits outside the ring at -28°, radius R+30, with a clock badge.
- **Past:** the ring is desaturated (grayscale 0.85, opacity 0.75).
- **Every ring is paired with a text line**:
  - "Be first in the circle · 12 spots open" when nobody is booked;
  - "8 of 12 open · 4 going";
  - "Full · 12/12".
  - The accessible label is "8 of 12 spots open".
- **Mini arc** for lists: 44px. A thin `seatOpen` full circle with a 5px `pine` progress arc from 12 o'clock (`full` when sold out), and "k/n" in the centre.
- **Motion:** taking a seat draws your arc in 420ms. When the last seat fills, the ring spins once (700ms) and turns `full`: the "Full circle" moment.

**Story rings** reuse the same segmentation: one arc per story, `pine` for unseen and `rule` for seen. Your own ring is `gold`.

## Thumb reach (mobile web, Android, iOS)

The things people use most sit in the bottom third of the screen.

1. **Tab bar:** Explore · Tribe · **(+)** · My trips · You.
   - The centre **+** is a raised pine circle. It opens the "What are you sharing?" bottom sheet: Plan, Story, Question, Poll.
2. **The primary action is pinned in a bottom bar** above the safe area, never in the top-right corner:
   - Trip page: save, price and **Grab a spot**.
   - Plan: **Request to join**.
   - Composers: **Publish**, riding above the keyboard.
   - Post detail: the comment box.
   - Chat: the message box.
   - Story viewer: the reply bar.
3. **Explore search sits at the bottom:** a floating pill above the tab bar ("Where to? · Any week", plus a filter button).
   - Tapping it opens the search and filters bottom sheet, with the departure city at the top of the sheet.
   - The top bar keeps only the wordmark plus the Activity and Messages icons with their badges. These are glance targets, not frequent taps.
4. **Pickers, filters, confirmations and menus open as bottom sheets,** with their buttons at the bottom of the sheet. Destructive actions also sit at the bottom, and need a second tap.
5. **Scroll-away top chrome:** large titles collapse on scroll. Category chips (Explore) and feed filters (Tribe) stay near the top because people scan them rather than tap them often. Swiping between Tribe filters is not added.
6. **Back:**
   - iOS uses edge swipe.
   - Android uses system back.
   - On mobile web, the trip and post pages float a round back button at the top-left over the cover, and the bottom bar repeats the primary action.

Desktop web keeps a top navigation bar, since reach doesn't apply.

## Components (all platforms)

| Component | Web class or component | Notes |
|---|---|---|
| Primary button | `.pc-btn` | Yellow pill with black text, 52px (`.pc-btn-sm` is 40px) |
| Secondary button | `.pc-btn-outline` / `.pc-btn-quiet` | 1.5px pine outline / tonal fill |
| Chip | `.pc-chip` | 40px pill. Selected is a pine fill |
| Card | `.pc-card` (also `.pc-surface`, `.pc-printed`) | Surface, 28px radius, 1px rule |
| Plan card | `.pc-pencilled` | Surface, 28px radius, 1px *dashed* `rule2`. Plans are pencilled in |
| Tag | `.pc-tag-host` (gold), `.pc-tag-organiser` (ink), `.pc-tag-women` (rose), `.pc-tag-verified` (pine) | |
| Seat ring | `<SeatRing>` | See above |
| Mini arc | `<MiniArc>` | 44px |
| Bottom bar | `.pc-actionbar` | Blurred surface, top rule, safe-area padding |
| Search dock | `.pc-dock` | 56px pill floating above the tab bar |
| Sheet | `.pc-sheet` | 28px top radius, grab handle |

## Motion

| Motion | Spec |
|---|---|
| Grab a spot | Your arc draws in over 420ms (stroke-dash) |
| Full circle | 700ms spin, then the ring turns `full` |
| Request | Your face slides in outside the ring, 340ms |
| Held | Dashed gold arc, opacity pulse 1.6s |
| Press | Scale 0.97, 150ms |

All of these respect reduced motion.

## Web implementation

- **Tokens and theme mapping:** tokens are mapped onto the shadcn variables in `src/app/globals.css`, with primary set to pine. The legacy Tailwind `blue-*` scale is remapped to a pine scale, so older "info" accents follow.
- **Components:** they live in `src/app/full-circle.css`, inside the `components` layer so Tailwind utilities still win. The class names keep the `pc-` prefix.
- **The seat ring and related pieces:** `src/components/tribe/SeatRing.tsx` holds `SeatRing`, `MiniArc`, `StoryRing`, `segsFromSeats`, `segsFromCounts` and `ringCaption`. `SeatRow` is a compatibility wrapper around it.
- **Explore:**
  - `src/components/explore/fc/` holds `TripRingCard` (the photo-first card), `TripListRow`, `PlanMiniCard`, `ExploreHeader`, and the mobile top bar, chips and search dock.
  - `src/components/tribe/DeparturesTable.tsx` renders "Leaving soon" and "Next few weeks".
- **Trip page:** `TripCircle` (in `src/components/tribe/TripTribeSection.tsx`) is the ring for the next departure. On mobile, the page has a cover, the ring overlapping it, and a `.pc-actionbar` for the primary action. The tab bar and top navbar are hidden on `/packages/*` and `/tribe/p/*`.
- **Local preview without a database (development only):**
  - `/dev/img/*` serves sample photos.
  - `DEMO_TRIPS` (`src/lib/tribe/demo-trips.ts`) and `demoPackage()` (`src/lib/packages/demo-package.ts`) fill Explore and `/packages/<demo-slug>`.
- **Charts (admin analytics):** a single pine hue, `#0E5A47` in light mode and `#3FB58E` in dark, with 2px lines and a hairline grid.
