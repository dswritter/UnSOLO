import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from '@/components/ui/sonner'
import { Suspense } from 'react'
import { NavigationProgress } from '@/components/layout/NavigationProgress'

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

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

// Inline script that runs before paint to set dark/light class
// This avoids the flash of wrong theme
const themeScript = `
(function(){
  try {
    var d = document.documentElement;
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      d.classList.add('dark');
    } else {
      d.classList.remove('dark');
    }
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
      if (e.matches) { d.classList.add('dark'); } else { d.classList.remove('dark'); }
    });
  } catch(e){}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
