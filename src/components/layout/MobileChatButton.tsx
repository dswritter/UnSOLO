'use client'

import { useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { MessageCircle } from 'lucide-react'

interface MobileChatButtonProps {
  isAuthenticated?: boolean
}

export function MobileChatButton({ isAuthenticated = false }: MobileChatButtonProps) {
  const pathname = usePathname()
  const router = useRouter()

  if (
    pathname === '/' ||
    pathname?.startsWith('/community') ||
    pathname?.startsWith('/chat') ||
    pathname?.startsWith('/tribe')
  ) {
    return null
  }

  const redirectTo = pathname || '/'

  const handleClick = useCallback(() => {
    if (!isAuthenticated) {
      router.push(`/login?redirectTo=${encodeURIComponent(redirectTo)}`)
      return
    }
    router.push('/community')
  }, [isAuthenticated, redirectTo, router])

  return (
    <button
      type="button"
      onClick={handleClick}
      className="fixed bottom-[calc(5.2rem+env(safe-area-inset-bottom))] right-4 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-[0_14px_40px_rgba(0,0,0,0.35)] transition-all hover:bg-primary/90 active:scale-95 md:hidden"
      aria-label="Open Meet Travellers"
    >
      <MessageCircle className="mx-auto h-6 w-6" />
    </button>
  )
}
