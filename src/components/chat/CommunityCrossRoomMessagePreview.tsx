'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'

type RoomLite = { id: string; name: string }

type PreviewState = {
  id: string
  roomId: string
  roomName: string
  content: string
}

function normalizeRoomId(id: string) {
  return id.trim().toLowerCase()
}

/**
 * On mobile, ChatNotificationWidget is hidden on /community. When the user is viewing
 * one room, show a short top banner for new messages in other rooms.
 */
export function CommunityCrossRoomMessagePreview({
  viewerUserId,
  rooms,
}: {
  viewerUserId: string
  rooms: RoomLite[]
}) {
  const pathname = usePathname()
  const [preview, setPreview] = useState<PreviewState | null>(null)

  const roomNameById = useCallback(
    (id: string) => rooms.find(r => normalizeRoomId(r.id) === normalizeRoomId(id))?.name ?? 'Chat',
    [rooms],
  )

  useEffect(() => {
    function onNewMessage(ev: Event) {
      const ce = ev as CustomEvent<{
        id: string
        room_id: string
        content: string
        user_id: string
        message_type?: string
      }>
      const msg = ce.detail
      if (!msg || msg.message_type === 'system') return
      if (msg.user_id === viewerUserId) return

      const match = pathname?.match(/\/community\/([a-f0-9-]+)/i)
      const activeRoomId = match?.[1] ?? null
      if (!activeRoomId) return
      if (normalizeRoomId(msg.room_id) === normalizeRoomId(activeRoomId)) return

      const known = new Set(rooms.map(r => normalizeRoomId(r.id)))
      if (!known.has(normalizeRoomId(msg.room_id))) return

      const roomName = roomNameById(msg.room_id)
      setPreview({
        id: msg.id,
        roomId: msg.room_id,
        roomName,
        content: msg.content.length > 100 ? `${msg.content.slice(0, 100)}…` : msg.content,
      })
    }

    window.addEventListener('unsolo:new-message', onNewMessage)
    return () => window.removeEventListener('unsolo:new-message', onNewMessage)
  }, [pathname, viewerUserId, rooms, roomNameById])

  useEffect(() => {
    if (!preview) return
    const t = window.setTimeout(() => setPreview(null), 2000)
    return () => window.clearTimeout(t)
  }, [preview])

  if (!preview) return null

  return (
    <div className="md:hidden fixed top-[calc(64px+env(safe-area-inset-top,0px))] left-2 right-2 z-[45] pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-lg px-3 py-2.5 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-primary truncate">{preview.roomName}</p>
          <p className="text-xs text-foreground line-clamp-2 mt-0.5">{preview.content}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            type="button"
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary"
            aria-label="Dismiss"
            onClick={() => setPreview(null)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <Link
            href={`/community/${preview.roomId}`}
            className="text-[10px] font-medium text-primary whitespace-nowrap"
            onClick={() => setPreview(null)}
          >
            Open
          </Link>
        </div>
      </div>
    </div>
  )
}
