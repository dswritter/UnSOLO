# Staff-created host listings

## Deployment

1. Apply `supabase/migrations/104_staff_host_listing_assignments.sql` in the Supabase SQL editor **before deploying the UI**. Migrations are not applied automatically in this project.
2. Configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the deployment environment. `.env` contains local placeholders, not real credentials.
3. Deploy the application. No changes to existing Supabase signup triggers are required.

## Staff workflow

- **Service listings:** Admin → Service Listings → Create Listing → **Create on behalf of a host**. Enter the host's email, phone, or both and complete the listing, including photos.
- **Trips:** Admin → Community Trips → **Create trip on behalf of a host**. Complete the full trip form and enter their contact.
- Admins and host-onboarding staff have access. Custom staff roles need the corresponding `service_listings` or `community_trips` permission.
- Before linking, the listing shows **Awaiting host signup / contact verification**. Staff can correct the contact from its editor/details. New delegated listings stay pending; ownership must be linked before approval/publication.

## Linking behavior

- Existing verified accounts link immediately. Future accounts link automatically after email confirmation (including Google/Apple signup), Supabase phone confirmation, Indian OTP verification, or staff-approved international phone verification.
- The current signup UI uses email. For a phone-only assignment, the host signs up normally and verifies the matching phone through the existing host-verification page.
- Emails are trimmed and case-insensitive. Phones include country codes; supported staff-entry countries match the existing verification flow: India, Nepal, Sri Lanka and Bhutan.
- If email and phone match different verified accounts, or a phone matches multiple accounts, the listing remains unclaimed with **Contact conflict**. Staff must correct the contact; no account wins arbitrarily.
- Linking sets the primary `host_id` and grants host-dashboard management access. It does **not** mark contacts verified, expose their phone publicly, configure payouts, change moderation status, or transfer existing earnings.
- Claimed listings cannot be reassigned through this feature. Changing the account's contact later does not transfer ownership. There is no arbitrary expiry for hosts who join later.
- Contact details are stored in a private, RLS-enabled table with no anonymous/authenticated access. Database rules prevent direct client OTP access, granting phone verification, or self-promoting staff roles.

## Validation

Run `npm test` and `npx tsc --noEmit`. The embedded PostgreSQL tests apply the real migration against a minimal existing schema and exercise verified signup/phone triggers, conflicts, atomic rollback, idempotency, publication safeguards and client-access restrictions.

Before production rollout, smoke-test against staging Supabase with a staff-created listing and a new host account. Confirm ownership appears in `/host` after contact verification, the host can edit it, and unrelated accounts cannot access the private assignment or manage that listing.