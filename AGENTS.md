<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Every change ships on every platform

UnSOLO is one product on three clients: the web app (`src/`, Next.js), Android (`mobile/android`, Kotlin/Compose) and iOS (`mobile/ios`, SwiftUI), all on the same API (`src/app/api/v1`, documented in `docs/revamp/api-v1.md`).

- Any user-facing feature, fix, wording change or behaviour change is done on web, Android and iOS in the same piece of work, not "web now, apps later". Server/API changes are made so all three clients can use them, and each client is updated to use them.
- Only skip a platform when the thing truly doesn't exist there (e.g. admin screens are web-only, Android notification channels are Android-only), and say so in the summary.
- Keep shared rules in one helper per platform with matching names and tests (e.g. seat wording: `src/lib/seats.ts`, `SeatCopy.kt`, `SeatCopy.swift`).
- New enum-like values from the API (categories, types, statuses) must not break older clients: decode unknown values to a safe default.
- Before calling it done: web type-checks and tests pass, Android `compileDebugKotlin` and unit tests pass, iOS builds and its tests pass.
