import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  /**
   * Client router cache: soft navigations reuse prefetched RSC payloads instead of
   * refetching on every click (defaults: dynamic 0s, static 5m). Helps Explore ↔ Host feel instant.
   * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/staleTimes
   */
  experimental: {
    staleTimes: {
      dynamic: 120,
      static: 300,
    },
  },
};

export default nextConfig;
