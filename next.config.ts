import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/leaderboard_v2', destination: '/leaderboard', permanent: true },
      { source: '/leaderboard_v2/:path*', destination: '/leaderboard', permanent: true },
      { source: '/profile_v2', destination: '/profile', permanent: true },
      { source: '/profile_v2/edit', destination: '/profile', permanent: true },
      { source: '/profile_v2/:username', destination: '/profile/:username', permanent: true },
    ]
  },
  async rewrites() {
    return [
      { source: '/community', destination: '/tribe' },
      { source: '/community/:path*', destination: '/tribe/:path*' },
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
