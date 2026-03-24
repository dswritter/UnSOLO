# UnSOLO v1 — Traditional Packages Model

> This branch (`v1-traditional-packages`) preserves the fully working traditional tour package website before pivoting to the peer-to-peer hosting model.

## Why This Branch Exists
We pivoted from admin-managed tour packages to a **peer-to-peer trip hosting** model (like Airbnb for group trips). This branch is the stable snapshot of the traditional model — fully functional, deployed, and tested.

## Stack
- **Frontend:** Next.js 15 (App Router), Tailwind CSS, shadcn/ui
- **Backend:** Supabase (Postgres, Auth, Realtime, Storage)
- **Payments:** Razorpay (INR, UPI, Cards, Netbanking)
- **Email:** Resend
- **Hosting:** Vercel

## Features in This Version

### Customer Features
- Email + Google OAuth signup/login
- Browse & filter packages (difficulty, budget, duration, month)
- Book trips with Razorpay (solo + group split payments)
- Group booking: add friends by username, split payment with notifications
- Real-time chat (trip rooms, community rooms, DMs)
- Follow/unfollow users, phone number request system
- Profile: avatar selection, bio, location, Instagram, status
- Travel stats: states unlocked, badges, achievements, points & tiers
- Reviews: dual rating (destination + experience)
- Leaderboard: dynamic scoring
- Referral system: invite code, ₹200 new user discount, ₹500 referrer credit
- Promo codes at checkout
- Trip countdown on bookings page
- WhatsApp sharing for packages
- Notification bell (real-time + browser push)
- Online/offline presence tracking
- Dark mode + light mode with brand-consistent gold theme

### Admin Features
- Dashboard with stats (users, revenue, bookings, requests)
- Package management: create/edit packages, upload images, manage departure dates
- Booking management: confirm, assign POC, admin notes
- Cancellation flow: approve/deny, set refund amount, initiate Razorpay refund
- Team management: add staff with roles (social media, field person, chat responder)
- Custom date request review
- Discount & promo code management
- Grant loyalty credits to users
- Notification bell for admin events
- Audit logging

### Technical
- Page-level ISR caching (explore 5min, homepage 1hr, leaderboard 10min)
- Server actions with fresh DB checks at checkout (never cached)
- Razorpay webhooks: payment.captured, payment.failed, refund.processed, refund.failed
- Supabase RLS policies on all tables
- Real-time presence via heartbeat + pagehide/beforeunload
- Loading skeletons for all major pages
- next/image with Supabase remote patterns

## How to Run
```bash
npm install
cp .env.example .env.local  # fill in Supabase + Razorpay keys
npm run dev
```

## What Changed After This Branch
The `main` branch evolved to support **peer-to-peer trip hosting** where any verified user can host trips, set pricing, and manage joiners — alongside the traditional UnSOLO-managed packages.
