# Future plans (not scheduled)

## Bot / signup protection (Turnstile or similar)

**Trigger:** Consider implementing when **registered user count exceeds ~5,000** (or if abuse metrics spike earlier).

**What:** Add Cloudflare Turnstile (or hCaptcha) on **signup** and optionally on **payment / booking** flows. The widget proves the browser is likely human; the server verifies a token before creating accounts or Razorpay orders.

**Why wait:** Adds dependency, keys, UX friction, and monitoring. Fine to ship later while internal rate limits (chat, bookings, interests) cover basic abuse.

**References:** Cloudflare Turnstile docs, Supabase Auth rate limits in project settings.
