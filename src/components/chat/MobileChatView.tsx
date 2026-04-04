'use client'

import { useState, useEffect } from 'react'
import { ChatRoomLoader } from './ChatRoomLoader'
import { ChatSidebar, type SidebarRoom } from './ChatSidebar'
import type { Profile } from '@/types'

interface MobileChatViewProps {
  rooms: SidebarRoom[]
  currentUser: Profile
}

function getRoomIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/^\/community\/([a-f0-9-]+)$/i)
  return match?.[1] || null
}

export function MobileChatView({ rooms, currentUser }: MobileChatViewProps) {
  const [roomId, setRoomId] = useState<string | null>(getRoomIdFromUrl())

  useEffect(() => {
    function handlePopState() {
      setRoomId(getRoomIdFromUrl())
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function handleBack() {
    window.history.pushState(null, '', '/community')
    setRoomId(null)
  }

  if (roomId) {
    return (
      <div className="flex flex-col h-full">
        <ChatRoomLoader roomId={roomId} currentUser={currentUser} onBack={handleBack} />
      </div>
    )
  }

  return (
    <ChatSidebar rooms={rooms} className="w-full" />
  )
}
