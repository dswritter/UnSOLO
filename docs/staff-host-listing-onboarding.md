# Staff-created host listings

## Deployment

1. Apply `supabase/migrations/104_staff_host_listing_assignments.sql`, then `supabase/migrations/105_staff_host_contact_search.sql`, then `supabase/migrations/106_staff_created_listing_approval.sql`, then `supabase/migrations/107_packages_updated_at_repair.sql` in the Supabase SQL editor **before deploying the UI**. Migration **105 enables the host picker**; **106 enables direct staff approval and safe activation after linking**; **107 repairs the package update timestamp required by linking**. Migrations are not applied automatically in this project.
2. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the deployment environment. `.env` contains local placeholders, not real credentials.
3. Deploy the application. No changes to existing Supabase signup triggers are required.

Separately apply `supabase/migrations/108_wander_hero_metrics.sql` before deploying the optimized Wander hero. This adds the cached hero aggregate RPC and recent-review indexes. The RPC is service-role-only; no public grants or additional client credentials are required.

Apply `supabase/migrations/109_explore_pagination_metadata_search.sql` before deploying incremental Explore search. It adds indexed JSONB metadata/search documents and the public-safe paginated trip search RPC. No backfill or listing rewrite is needed; existing trip rows receive an empty metadata object and their search documents are populated by the migration.

The Explore page then loads 24 trips or 12 service listings per request. It displays a **Load more** button, keeps the filter/search in the URL, and searches indexed title, description, destination, tags, amenities, and JSONB metadata before paging. Trip metadata is editable in the host trip form under **Searchable details**; admin service listings have **Additional searchable details**. Keep structured type-specific service attributes in `metadata` and tags/amenities in their existing fields.

### Retrying a failed migration

If an earlier run failed with `column "created_on_behalf_by" of relation "packages" already exists`, use the updated migration `104` and rerun **the entire file**, including `BEGIN` and `COMMIT`. It now retains existing columns, tables and indexes, replaces its functions, and recreates only its own triggers. Existing listings, contacts, ownership, audit logs and notifications are preserved. Do not delete the existing audit columns or assignment table to retry.

If the SQL session reports `current transaction is aborted`, issue `ROLLBACK` in that session first, then rerun the complete updated file. Notices that an object already exists or a trigger does not yet exist are expected on installation/retry, not errors.

### Fixing Create Trip: missing packages.updated_at

If **Create trip** fails with `column "updated_at" of relation "packages" does not exist`, the database is missing the timestamp setup from migration 030. Apply the **entire** `supabase/migrations/107_packages_updated_at_repair.sql` in Supabase, then retry creating the trip. No application redeployment is needed for this SQL-only repair if migrations 104–106 and the current UI are already deployed.

Migration 107 safely adds the missing column, fills only missing timestamps from `created_at` (or the current time if unavailable), and restores the package update trigger. Existing timestamps, listing ownership, approval, and publication status are preserved. It can be rerun on databases that already have the column; do not delete existing listings or assignments. The failed atomic creation rolls back, so retrying it does not require cleaning up a partially created trip.

## Staff workflow

- **Service listings:** Admin → Service Listings → Create Listing → **Create on behalf of a host**. This supports stays, activities, rentals and getting-around listings. The option is unchecked by default; leave it unchecked for normal, non-delegated creation. When checked, the submit button reads **Create listing for a host**. Search and pick a host contact, or manually enter their email, phone, or both, and complete the listing, including photos.
- **Trips:** Admin → Community Trips → **Create trip on behalf of a host**. Complete the full trip form and search/pick or manually enter their contact. Ordinary host trip creation does not show the staff contact picker.
- Admins and host-onboarding staff have access. Custom staff roles need the corresponding `service_listings` or `community_trips` permission.
- Staff-created trips and services are approved on creation: use **Create trip** or **Create listing for a host**, not **Submit for review**. If the host is already verified and linked, the listing becomes active immediately. Otherwise it stays approved but inactive, showing **Awaiting host signup / contact verification**, and becomes active after verified linking. Staff can correct the contact from its editor/details. Ordinary host submissions still require admin review.
- Migration 106 does not approve or activate old pending listings retrospectively. Existing rejected/archived/pending listings remain unchanged; staff approval and publication controls remain available in their editors. Saving a host’s draft remains **Save draft**, without publication.

## Where to find listings and add more for one host

- All service listings appear under **Admin → Service Listings** (`/admin/service-listings`), with pending/linked/conflict ownership status. Search by title, location, or the assigned contact.
- Staff-created trips appear under **Admin → Community Trips** (`/admin/community-trips`). Search by title, host name, or assigned contact.
- After the host verifies the matching contact, all linked trips and services appear in their **Host Dashboard** (`/host`). New staff-created listings go live after linking; older pending listings remain manageable there, but are not public until approved.
- Create each additional listing separately using the **same host contact**. One host can own many trips and any mix of stays, activities, rentals and getting-around listings. There is no one-listing-per-host restriction. Reuse the same verified email/phone consistently to avoid splitting assignments across accounts.

## Public host profiles

- Linked hosts open their account profile from trip and service listing host cards. Profile URLs encode the username, including spaces and special characters.
- Next.js 16.2 supplies encoded dynamic parameters to pages. The profile route decodes the username exactly once before lookup and canonical-URL comparison; literal percent sequences in usernames are preserved.
- Before account linking, public staff-created listings open a name-only host page at `/hosts/trip/<listing-id>` or `/hosts/service/<listing-id>`. These pages show only the host name and the public listing, never assignment email, phone, or internal status. They do not offer messaging or account-only social actions.
- Unpublished listings do not expose a host page. Once ownership is linked, the same host URL redirects to the account profile.
- Older `/profile/<host-name>` links resolve case-insensitive usernames or a unique registered host display name, then redirect to the canonical username URL. A unique unlinked assignment name can also redirect to its public host page. Ambiguous names remain not found rather than choosing another host.
- This uses the `host_name` column from migration **111**. No additional database migration is required.

## Hosting page loading

- Verification status and payout details load together on the server, so **Become a host** renders its current step without waiting for browser hydration and two subsequent server-action requests.
- Dashboard host checks are deduplicated within a render only. Statistics and independent dashboard queries run concurrently; private verification, payout, and booking data are not shared in a persistent cache.
- Trip creation and editing receive options and server-authorized initial data from their pages rather than repeating access checks and trip reads after hydration. Mutation actions still check permissions. Resumed drafts continue checking the cloud for newer staff edits; a fresh trip does not query the cloud for its newly generated draft ID.
- Resuming a cloud-only trip draft preserves its requested ID even when no local copy exists. Failed OTP requests show an error and allow retrying instead of leaving the verification button stuck.
- Service creation loads destinations and the latest draft concurrently. Trip management loads cancellation/change details and interests concurrently.
- Admin navigation no longer refreshes the router on every page change: that invalidated Next.js's back/forward cache, including previously visited Hosting pages. Review actions and relevant realtime events still refresh affected queues. Confirmed departures from the trip form use client navigation instead of reloading the document.
- Authentication state is shared above the site/admin route groups. Sign-out clears this device's cookies, identity, cached profile and query data immediately, then revokes the captured session remotely. Remote failures are reported without signing the device back in.
- No database migration is required. Validate with a signed-in host on staging: open verification, dashboard, create trip, edit trip, create service, edit service, payout and manage trip; confirm redirects and host/staff permissions still apply.

## Admin and host locations

- **Admin → Service Listings → New listing** (`/admin/service-listings/create`) first asks what is being listed (Trip, Stay, Activity, Rental). Trip opens the staff trip form; the others open the same multi-step form hosts use (`?type=stays|activities|rentals`). In both, the host is chosen first and the remaining fields appear only after that. Staff can add multiple items with their own pricing unit (rentals: per hour, day, week or month), photos and amenities. Publishing calls `createServiceListingForHost`, which creates the approved delegated listing and its items, and removes the listing again if the items cannot be saved. The listing is linked when the host signs in with that contact. Staff-created listings never write a cloud draft.
- Platform listings without a host remain available from the chooser (`?mode=platform`) using the original admin form, which no longer has its own on-behalf section. That form and admin editing offer only the pricing units valid for the listing type, while keeping a legacy saved unit selectable.
- Trips, stays, activities, rentals and admin forms share one location picker (`ListingLocationPicker`): address search with multiple matches, device location, Google Maps share link and a draggable pin confirmed only by **Use this pin**. Stays and rentals require the pin.
- Host and staff-created trips support an optional exact meeting point, alongside the trip's primary destination. The address and pin are stored in package metadata, survive local/cloud drafts and edits, and appear in the preview and public trip page. Cancelling a map adjustment does not change the saved pin.
- Existing listings remain valid without a meeting point. No migration is required.

## Mobile authentication

- Google sign-in appears before email fields on both login and signup. Mobile leaves an unobstructed campfire scene above the compact form, and does not automatically scroll to or focus an input.
- Community metrics (travellers, hosts, rating, happy customers) load in one row after the form renders, from `/api/auth-metrics` (CDN-cached for an hour). The browser keeps its copy in `localStorage` and only refetches on a reload, a newly opened tab/browser session, or after 24 hours. Unavailable or zero values are hidden; if metrics fail (8s timeout), the row disappears and sign-in remains usable.
- Email forms use placeholder hints with screen-reader labels; signup reveals the confirm-password field once a password is entered.
- Email/password, password visibility, password reset, email verification, referral codes and return URLs remain available. Desktop keeps the two-column scene and statistics.

## Listing photos

Under **Admin → Service Listings → Create Listing → Photos**, choose **Select listing photos** to upload multiple images in one selection. On desktop, use Ctrl/Cmd-click or Shift-click; on mobile, select multiple photos in the photo picker. JPEG, PNG, WebP and AVIF are supported, up to 5 MB per photo. Existing trip and host-service photo pickers also support multiple selection (host-service items retain their five-photo limit).

Photos upload in order and append to existing photos. The first photo remains the cover; reorder the URL lines to change it. URL entry is still available. Failed files are reported individually without discarding successful uploads. Cancel stops the remaining uploads and retains completed photos. Finish or cancel uploads before saving the listing.

## Host contact picker

- Search by host name, email, phone or previous listing title. Options include **registered accounts with verified contact** and **previous listing contact suggestions**; a previous contact is not proof of verification.
- Suggestions span all listing types, not just the type being created. For example, pick a contact from a prior trip when creating a new stay for the same host.
- The step starts with a single search box. Hosts load once when the form opens; typing filters them instantly while a debounced server search (cached per query) adds further matches. The server verifies the staff JWT with `auth.getClaims()` rather than an Auth round-trip per keystroke.
- Selecting a registered host shows a compact card (with **Change**) and no further inputs. A previous unregistered contact additionally asks only for the **Host display name**. Selection fills the contact only; it does not assign ownership by option ID or bypass the verified-contact linking rules.
- For a new host choose **New host** to enter display name, email and phone (email or phone required). Unverified contacts remain awaiting signup/verification; conflicting contacts remain unclaimed until staff correct them. New delegated listings are approved without self-review, but remain inactive until verified ownership is linked.
- Migration 105 enables search only: it does not migrate listing data, automatically create claimed assignments or reassign existing listings. Editing an existing listing does not expose the creation checkbox; claimed ownership remains non-reassignable through this feature.

## Linking behavior

- Existing verified accounts link immediately. Future accounts link automatically after email confirmation (including Google/Apple signup), Supabase phone confirmation, Indian OTP verification, or staff-approved international phone verification.
- The current signup UI uses email. For a phone-only assignment, the host signs up normally and verifies the matching phone through the existing host-verification page.
- Emails are trimmed and case-insensitive. Phones include country codes; supported staff-entry countries match the existing verification flow: India, Nepal, Sri Lanka and Bhutan.
- If email and phone match different verified accounts, or a phone matches multiple accounts, the listing remains unclaimed with **Contact conflict**. Staff must correct the contact; no account wins arbitrarily.
- Linking sets the primary `host_id` and grants host-dashboard management access. It activates a delegated listing only if it is already approved. It does **not** mark contacts verified, expose their phone publicly, configure payouts, change moderation status, or transfer existing earnings.
- Claimed listings cannot be reassigned through this feature. Changing the account's contact later does not transfer ownership. There is no arbitrary expiry for hosts who join later.
- Contact details are stored in a private, RLS-enabled table with no anonymous/authenticated access. Database rules prevent direct client OTP access, granting phone verification, or self-promoting staff roles.

## Repeating trip departures

In the host trip form (Details step), staff-created trips, staff-edited drafts, and curated admin package forms, **Offered departures** supports:

- **Specific dates**: individual departure / return rows as before.
- **Daily**: every day in your chosen range.
- **Weekly**: select one or more weekdays, such as Friday and Sunday.
- **Monthly**: select one or more dates of the month, such as 1, 15 and 28. Missing dates (e.g. February 30 or 31) are skipped, not moved to another day.

Enter the first departure/range start, first return/arrival, and **Repeat through** (last departure date). The same return-date offset is applied to every matching departure. Choose **Add to existing departures** or **Replace existing departures**, then click **Generate departures**. Review the generated rows and save/submit the trip. Individual dates remain editable; identical dates are deduplicated and conflicting return dates are rejected.

This is a date generator, not an endless recurring rule: all departure/return dates are stored in the existing booking-calendar format and in normal drafts/previews. Dates are generated only through your selected end date, within the next two years. Reopen the editor later to extend the schedule. No additional database migration is needed for recurring departures.

## Validation

Run `npm test` and `npx tsc --noEmit`. The embedded PostgreSQL tests apply the real migration against a minimal existing schema and exercise verified signup/phone triggers, conflicts, atomic rollback, idempotency, publication safeguards and client-access restrictions.

Before production rollout, smoke-test against staging Supabase with a staff-created listing and a new host account. Confirm ownership appears in `/host` after contact verification, the host can edit it, and unrelated accounts cannot access the private assignment or manage that listing.
## Rental rate options and security deposits

Apply `supabase/migrations/118_rental_rate_options_security_deposit.sql` before relying on these options. Until it is applied, rentals keep working with their standard rate; adding an option fails to save with an error.

- **Item setup (host and staff forms):** each rental item has its standard price and unit. Under it, **+ 24-hour rate**, **+ Daytime rate** (price plus from/until time) and **+ Security deposit** are added only when clicked and can be removed again. Nothing is filled in or offered to travellers otherwise. Other rules (extra hours, late fees, fuel, penalties) go in the item description.
- **Booking:** item cards list the extra rates and deposit. In the rental cart, items with extra rates get a rate picker; each 24-hour or daytime period counts as one of the booked days. The server re-prices from the database, stores `rental_rate_option` (and the daytime window in `booking_slot_start/end`), and charges the deposit on top: deposits are excluded from `gross_paise`, promos, credits, platform fee and host earnings.
- **Cancellation:** a held deposit is refunded in full on top of the policy-tier rental refund (shown as a separate line in the traveller and admin previews). Host earnings are split on the rental portion only. When staff approve a cancellation, the refund first covers the held deposit.
- **After the rental:** Admin → Bookings shows a **Security deposit** panel. **Refund full deposit** refunds it via Razorpay against the booking's payment; **Keep part of it** requires an amount and a reason, refunds the rest, and credits the kept amount to the host's earnings. Settlement is claimed atomically (no double refunds), reverted if Razorpay fails, audited, and the traveller is notified. Travellers see the deposit and its status under My Bookings.
