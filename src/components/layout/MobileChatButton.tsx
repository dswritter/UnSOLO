'use client'

import { usePathname, useRouter } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { useCallback } from 'react'

interface MobileChatButtonProps {
  isAuthenticated?: boolean
}

export function MobileChatButton({ isAuthenticated = false }: MobileChatButtonProps) {
  const pathname = usePathname()
  const router = useRouter()

  // Hide on community/chat pages
  if (pathname?.startsWith('/community') || pathname?.startsWith('/chat')) return null

  const handleClick = useCallback(() => {
    if (!isAuthenticated) {
      // Redirect to sign in like the Tribe button does
      router.push('/auth/signin')
    } else {
      router.push('/community')
    }
  }, [isAuthenticated, router])

  return (
    <button
      onClick={handleClick}
      className="md:hidden fixed bottom-24 md:bottom-6 right-6 z-40 bg-primary text-black rounded-full h-14 w-14 flex items-center justify-center shadow-lg hover:bg-primary/90 transition-all active:scale-95"
      aria-label="Open Tribe community chat"
    >
      <MessageCircle className="h-6 w-6" />
    </button>
  )
}
