# Owner to-do

Things only the owner can do (accounts, payments, devices). Agents: remind the owner of open items when relevant; tick them off here when done.

## Waiting on an iPhone / Apple Developer Program

- [ ] **Enrol in the Apple Developer Program** (needs an iOS device; added 2026-11-23).
- [ ] **Apple push key for iOS notifications**: Apple Developer → Keys → + → tick *Apple Push Notifications service* → download the `.p8` and note the Key ID. Then add to Vercel Production: `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_PRIVATE_KEY` (the `.p8` contents), `APNS_BUNDLE_ID=in.unsolo.app` (and `APNS_PRODUCTION=true` for App Store builds). Until then iPhones get no pushes; Android and web already do.
- [ ] Register the `in.unsolo.app` bundle ID, then TestFlight / App Store listing for the iOS app.
