import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/leaderboard_v2', destination: '/leaderboard', permanent: true },
      { source: '/leaderboard_v2/:path*', destination: '/leaderboard', permanent: true },
      { source: '/profile_v2', destination: '/profile', permanent: true },
      { source: '/profile_v2/edit', destination: '/profile', permanent: true },
      { source: '/profile_v2/:username', destination: '/profile/:username', permanent: true },
      // Tribe became the community feed; chat moved to /community. Keep old chat links
      // (emails, notifications, bookmarks) working: /tribe/<room uuid> → /community/<room uuid>.
      {
        source: '/tribe/:roomId([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})',
        destination: '/community/:roomId',
        permanent: false,
      },
    ]
  },
  async headers() {
    return [
      {
        // Baseline hardening for every response (CSP is a follow-up: inline boot script + Razorpay need nonces).
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), payment=(self "https://api.razorpay.com" "https://checkout.razorpay.com")' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/.well-known/assetlinks.json',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ]
  },

  images: {
    // Explicit allowlist — prevents the Next.js image optimizer from being
    // used as an open proxy for arbitrary external URLs.
    remotePatterns: [
      // Supabase Storage (all projects under *.supabase.co) — covers file uploads
      { protocol: 'https', hostname: '*.supabase.co' },
      // Google OAuth profile pictures
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      // GitHub avatars (OAuth via GitHub)
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      // Dicebear avatars (generated default avatars if used)
      { protocol: 'https', hostname: 'api.dicebear.com' },
      // Unsplash (stock photos sometimes used for admin-created packages)
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  /**
   * Client router cache: soft navigations (including browser back) reuse the
   * prefetched RSC payload instead of refetching from the server. Bumped
   * dynamic from 120s to 300s so the back button on mobile feels instant —
   * within five minutes the previous page renders straight from cache, no
   * loading skeleton flash.
   * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/staleTimes
   */
  experimental: {
    staleTimes: {
      dynamic: 300,
      static: 600,
    },
  },
};

export default nextConfig;
