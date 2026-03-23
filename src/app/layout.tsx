import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from '@/components/ui/sonner'

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
