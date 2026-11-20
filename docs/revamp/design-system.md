# Passenger Chart design system

Every trip is a passenger chart, and the people going are the invitation.

**Source of truth:** `design/tokens.json`. Run `node scripts/gen-design-tokens.mjs` to regenerate the token files for each platform:

| Platform | Generated file |
|---|---|
| Web | `src/app/tokens.generated.css` |
| Android | `mobile/android/app/src/main/java/com/unsolo/app/ui/theme/Tokens.kt` |
| iOS | `mobile/ios/UnSOLO/DesignSystem/Tokens.swift` |

Don't edit the generated files by hand.

## Rules

- **Ground.** Light chart paper `#F4F0E6`, raised `#FBF9F3`, ink `#16181C`. Dark mode uses the same roles with swapped values.
- **Gold `#FCBA12`** is used for three things only: the brand wordmark, *your* seat, and the HOST tag. Primary actions are **ink**.
- **Links** are rail blue `#1E4FA0`. **Errors and alerts** are red `#B8321C`. **Success** is green `#1F6E46`.
- **Surfaces.** Use hairline rules (1px `#D8D1C1`), not shadows or frosted glass. Radius is 6px.
- **Type.**
  - Titles: IBM Plex Sans Condensed 600.
  - Body: Plex Sans.
  - Numbers and codes: Plex Mono, tabular.
  - iOS uses the system font instead: titles in condensed width, numbers in monospaced digits.
  - Minimum text size is 12px.
- **Touch targets** are at least 44px.

## Printed vs pencilled

| | Hosted trip (paid, bookable) | Community plan (no money moves) |
|---|---|---|
| Rules | Solid ink | Dashed |
| Price | Mono price slot | Cost as body text ("Est. ₹14k each, split") |
| First line | — | "Community plan · not a booking" |
| Action | Ink **Take a seat** | Outline **Ask to join** |
| Tag | Gold **HOST** | Ink **ORGANISER** |
| Label in feeds | **HOSTED TRIP · BOOKABLE** | — |

## Seat row

The seat row is the signature component. It is a single tap target.

| State | Look |
|---|---|
| open | Dashed rule circle |
| member | Face or initials (solid ink when the viewer is signed out) |
| host / organiser | Face with a gold / ink bar underneath |
| you | Gold |
| requested | Ink outline with a clock badge, drawn in with the pencil-in motion |
| held | Dashed gold, pulsing (48h pay window) |

The table variant is a 16px strip of squares (taken = ink, open = dashed).

## Motion

| Motion | Spec |
|---|---|
| Seat stamp on Pay | 340ms overshoot |
| Pencil-in on request | 420ms clip |
| Held pulse | 1.6s |

All three respect `prefers-reduced-motion`.

## Web implementation

- Tokens are mapped onto the shadcn variables in `src/app/globals.css`, so existing components inherit the system.
- The components live in `src/app/passenger-chart.css`, inside the `components` layer so Tailwind utilities still win:
  - `.pc-btn`, `.pc-chip`, `.pc-seat*`, `.pc-printed`, `.pc-pencilled`, `.pc-tag-*`, `.pc-input`, `.pc-img`, `.pc-table`, `.pc-skel`
- **Charts** (admin analytics):
  - One hue: `#1E4FA0` in light mode, `#6B93D6` in dark. Both were validated against the raised surfaces.
  - 2px lines, about 10% area wash, hairline grid.
  - Crosshair and readout on hover or keyboard, plus a table view.
