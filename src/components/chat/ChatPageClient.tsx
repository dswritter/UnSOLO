'use client'

import { useState, useEffect } from 'react'
import { ChatRoomLoader } from './ChatRoomLoader'
import { MessageCircle } from 'lucide-react'
import type { Profile } from '@/types'

interface ChatPageClientProps {
  currentUser: Profile
  initialRoomId?: string | null
}

function getRoomIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/^\/community\/([a-f0-9-]+)$/i)
  return match?.[1] || null
}

export function ChatPageClient({ currentUser, initialRoomId }: ChatPageClientProps) {
  const [roomId, setRoomId] = useState<string | null>(initialRoomId || getRoomIdFromUrl())

  // Listen for URL changes (from sidebar pushState or browser back/forward)
  useEffect(() => {
    function handlePopState() {
      setRoomId(getRoomIdFromUrl())
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  if (!roomId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <MessageCircle className="h-16 w-16 mx-auto mb-4 text-primary/20" />
          <h3 className="text-lg font-bold text-muted-foreground">Select a conversation</h3>
          <p className="text-sm text-muted-foreground/60 mt-1">Choose from your chats on the left</p>
        </div>
      </div>
    )
  }

  return <ChatRoomLoader roomId={roomId} currentUser={currentUser} />
}
