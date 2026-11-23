import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'UnSOLO — travel together',
    short_name: 'UnSOLO',
    description: 'Book hosted trips and find people going your way.',
    // ?source=pwa lets the app honour the saved start page (Explore / Tribe / My trips) on launch.
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    background_color: '#FAFAF7',
    theme_color: '#FCBA12',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Android Chrome offers the Play Store app instead of installing the web app.
    related_applications: [{ platform: 'play', id: 'in.unsolo.app', url: 'https://play.google.com/store/apps/details?id=in.unsolo.app' }],
    prefer_related_applications: true,
    shortcuts: [
      { name: 'Tribe', url: '/tribe' },
      { name: 'Post', url: '/tribe/new' },
      { name: 'My trips', url: '/bookings' },
    ],
  }
}
