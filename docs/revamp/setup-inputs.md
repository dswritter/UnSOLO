# Inputs needed from the team

All of this is built so it works once these values are filled in. Nothing here is committed, and secrets go only in environment variables or local secret files.

## 1. Database: apply the migrations

The migrations live in `supabase/migrations/119_tribe_community.sql`, `120_trust_safety.sql` and `121_platform_devices_prefs_analytics.sql`.

1. Apply them to **staging** first with `supabase db push`, or paste each one into the SQL editor in order.
2. Run `npx vitest run src/lib/tribe/tribe-migrations.test.ts`. It exercises the same SQL in PGlite.
3. Apply them to production.

Migration 121 also closes three holes in production:
- `platform_settings` was writable by anyone.
- `get_or_create_dm_room` and `mark_room_messages_read` trusted the caller's user id, so they could act on someone else's behalf.

## 2. Web environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | What it is | Where to get it |
|---|---|---|
| `CRON_SECRET` | 16+ random characters. Cron endpoints now **refuse** requests when it is missing. Previously they fell back to a hard-coded default. | Generate with `openssl rand -hex 24` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push (VAPID). The subject is `mailto:hello@unsolo.in`. | `npx web-push generate-vapid-keys` (one time, any machine), or any P-256 key generator |
| `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | Android push (FCM HTTP v1) | Firebase console → Project settings → Service accounts → Generate key |
| `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID`, `APNS_PRODUCTION` | iOS push. Set `APNS_PRODUCTION=false` for TestFlight or debug builds. | Apple Developer → Keys → APNs key (.p8) **(needs the Apple developer ID)** |
| `SUPPORT_EMAIL` | Shown in the apps' Help screen | Your support inbox |
| `TWOFACTOR_API_KEY` (optional `TWOFACTOR_OTP_TEMPLATE`), or `MSG91_AUTH_KEY` / `MSG91_TEMPLATE_ID` | SMS codes for phone **sign-in** and phone verification, on all platforms | 2factor.in / MSG91 |

**Scheduled job:** call `GET /api/cron/tribe` with `Authorization: Bearer $CRON_SECRET` every 15 minutes. That cadence needs Vercel Pro cron, Supabase `pg_cron` plus `pg_net`, or any external scheduler. It expires requests and offers and sends any pushes that weren't sent inline. Sub-daily crons are not added to `vercel.json` because they fail Hobby-plan deploys.

## 3. Supabase Auth (Dashboard → Authentication)

- **Email:** set up an SMTP sender (Resend works) under Auth → SMTP. Turn on "Confirm email". Also enable email OTP, which the apps use for 6-digit codes.
- **Phone sign-in:** no Supabase SMS provider is needed. Leave Auth → Providers → Phone off.
  - Web, Android and iOS sign in by phone through `/api/v1/auth/phone/*`, which sends codes with the same 2factor.in or MSG91 key as phone verification (`TWOFACTOR_API_KEY`).
  - Set `TWOFACTOR_OTP_TEMPLATE=OTP1`, the approved DLT template ("Your OTP for Phone Verification is XXXX. Valid for 5 mins"). Because the template has a 4-character slot, SMS codes are **4 digits** and expire after **5 minutes**. Email codes stay 6 digits.
  - Auto-fill: iOS suggests the code from the keyboard bar; Android apps read it with Google's SMS User Consent prompt (the user taps Allow once). Chrome on Android would need the template to end with a line like `@unsolo.in #1234` (WebOTP); the web code already listens for it.
  - Email sign-in must stay enabled: phone-only accounts get a placeholder email (`<digits>@phone.unsolo.in`) that is never mailed.
- **Redirect URLs:** add `unsolo://auth-callback` and `https://unsolo.in/auth/callback`.
- **Google sign-in in the apps:** both apps reuse the Google provider the website already uses.
  - Add `unsolo://auth-callback` to the allowed redirect URLs.
  - **Android, for the one-tap Google sheet:** create an *Android* OAuth client in Google Cloud for package `in.unsolo.app` with your release and debug SHA-1. Put the existing *Web* client ID in `mobile/android/secrets.properties` as `GOOGLE_WEB_CLIENT_ID`. Without it, the app falls back to the browser sign-in flow.

## 4. Android (`mobile/android`)

| What | Where it goes |
|---|---|
| `google-services.json` from Firebase (package `in.unsolo.app`) | `mobile/android/app/google-services.json`. The Google Services plugin turns on only when this file is present. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | `mobile/android/secrets.properties`. Copy it from `secrets.properties.example`. |
| Release keystore and passwords | `mobile/android/keystore.properties`, which is gitignored. The SHA-256 fingerprint must match `public/.well-known/assetlinks.json`. |
| Play Console app and internal testing track | Google Play Console |

## 5. iOS (`mobile/ios`)

| What | Where it goes |
|---|---|
| Apple developer team ID and bundle id (currently `in.unsolo.app`) | Xcode → Signing & Capabilities |
| Push Notifications and Associated Domains (`applinks:unsolo.in`) capabilities | Same place. The entitlements file is already in the project. |
| `apple-app-site-association` | Serve it at `https://unsolo.in/.well-known/apple-app-site-association` with the team ID filled in. A template is in `docs/revamp/ios.md`. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | `mobile/ios/Config/Secrets.xcconfig`. Copy it from `Secrets.example.xcconfig`. |
| Sign in with Apple | Needs the developer ID. The button is present but turned off until then. |

## 6. Trust and safety

- **Grievance officer** name, email and address. The IT Rules require these on the site and in the apps. Put them in Settings → Help and on `/terms`.
- **ID verification provider** (DigiLocker partner API, or a KYC vendor). It is needed for women-only plans and plans of 5+ people. Until then, staff can set `profiles.is_id_verified` from the admin Users page. The trigger lets only admins change it.
- Review the blocklist in `src/lib/moderation/screen.ts` (`BLOCKLIST`). Add Hindi and regional terms your team sees in practice.
