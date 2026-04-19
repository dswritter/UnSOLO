'use client'

import { usePathname } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import Link from 'next/link'

export function MobileChatButton() {
  const pathname = usePathname()

  // Hide on community/chat pages
  if (pathname?.startsWith('/community') || pathname?.startsWith('/chat')) return null

  return (
    <Link
      href="/community"
      className="md:hidden fixed bottom-[100px] md:bottom-6 right-6 z-50 bg-primary text-black rounded-full h-14 w-14 flex items-center justify-center shadow-lg hover:bg-primary/90 transition-all active:scale-95"
    >
      <MessageCircle className="h-6 w-6" />
    </Link>
  )
}
