import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from '@/components/ui/sonner'
import { Suspense } from 'react'
import { NavigationProgress } from '@/components/layout/NavigationProgress'
import { QueryProvider } from '@/providers/QueryProvider'
import { COLOR_MODE_BOOT_SCRIPT } from '@/lib/theme/color-mode'
import { AuthProvider } from '@/components/layout/AuthProvider'
import { PhoneGateHost } from '@/components/auth/PhoneGateHost'

// Full Circle type: Figtree (body, labels, numbers with tabular figures) + Bricolage Grotesque (headings, prices).
// Bricolage is loaded with a plain Google Fonts stylesheet (see <head>): its multi-axis font files fail
// next/font's build-time download on Vercel (Turbopack "Can't resolve …/internal/font/google/font").
// Both are self-hosted (src/app/fonts, SIL Open Font License): next/font/google downloads them at build
// time and that download sometimes fails on Vercel, failing the whole deploy (same Turbopack error).
const figtree = localFont({
  src: [{ path: "./fonts/Figtree-latin.woff2", weight: "400 700", style: "normal" }],
  display: "swap",
  variable: "--font-sans",
});

// Wordmark keeps the original UnSOLO type: Inter Black, tight tracking (main branch).
const interWordmark = localFont({
  src: [{ path: "./fonts/Inter-latin.woff2", weight: "900", style: "normal" }],
  display: "swap",
  variable: "--font-wordmark",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAF7" },
    { media: "(prefers-color-scheme: dark)", color: "#0F0F0F" },
  ],
}

export const metadata: Metadata = {
  title: "UnSOLO — Change the way you travel",
  description: "India's solo travel community. Discover trips, connect with fellow travelers, chat, and build your travel legacy.",
  keywords: ["solo travel", "India travel", "travel community", "trekking", "backpacking"],
  openGraph: {
    title: "UnSOLO — Change the way you travel",
    description: "India's solo travel community for explorers, trekkers & wanderers.",
    type: "website",
  },
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${figtree.variable} ${interWordmark.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: COLOR_MODE_BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- app-wide display font, loaded once in the root layout */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700..800&display=swap" />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <QueryProvider><AuthProvider>{children}<PhoneGateHost /></AuthProvider></QueryProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
