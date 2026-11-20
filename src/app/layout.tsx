import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Condensed } from "next/font/google";
import "./globals.css";
import { Toaster } from '@/components/ui/sonner'
import { Suspense } from 'react'
import { NavigationProgress } from '@/components/layout/NavigationProgress'
import { QueryProvider } from '@/providers/QueryProvider'
import { COLOR_MODE_BOOT_SCRIPT } from '@/lib/theme/color-mode'
import { AuthProvider } from '@/components/layout/AuthProvider'

// Passenger Chart type: Plex Sans (body), Plex Sans Condensed (titles), Plex Mono (numbers/codes).
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-sans",
});
const plexCondensed = IBM_Plex_Sans_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-pc-condensed",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
  variable: "--font-pc-mono",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F0E6" },
    { media: "(prefers-color-scheme: dark)", color: "#14161A" },
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
    <html lang="en" className={`${plexSans.variable} ${plexCondensed.variable} ${plexMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: COLOR_MODE_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <QueryProvider><AuthProvider>{children}</AuthProvider></QueryProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
