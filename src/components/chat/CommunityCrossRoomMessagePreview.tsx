'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'

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
  const router = useRouter()
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)

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
    const t = window.setTimeout(() => setPreview(null), 2400)
    return () => window.clearTimeout(t)
  }, [preview])

  function goToChat() {
    if (!preview) return
    router.push(`/community/${preview.roomId}`)
    setPreview(null)
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!preview || !touchStartRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touchStartRef.current.x
    const dy = t.clientY - touchStartRef.current.y
    touchStartRef.current = null

    const absX = Math.abs(dx)
    const absY = Math.abs(dy)

    // Dismiss: swipe up, or sideways (not a tap)
    if (dy < -36 || absX > 44) {
      suppressClickRef.current = true
      window.setTimeout(() => { suppressClickRef.current = false }, 400)
      setPreview(null)
      return
    }

    // Tap / small movement: open chat (avoid treating swipe as navigation)
    if (absX <= 14 && absY <= 14) {
      suppressClickRef.current = true
      window.setTimeout(() => { suppressClickRef.current = false }, 400)
      goToChat()
    }
  }

  return (
    <div className="md:hidden fixed top-[calc(64px+env(safe-area-inset-top,0px))] left-2 right-2 z-[45] pointer-events-none">
      <AnimatePresence mode="sync">
        {preview ? (
          <motion.div
            key={preview.id}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16, transition: { duration: 0.25, ease: [0.4, 0, 0.2, 1] } }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto rounded-xl border border-border bg-card/95 backdrop-blur-md shadow-lg overflow-hidden text-left"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onClick={e => {
              if (suppressClickRef.current) {
                e.preventDefault()
                e.stopPropagation()
              }
            }}
            role="button"
            tabIndex={0}
            onKeyDown={ev => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault()
                goToChat()
              }
            }}
          >
            <div className="px-3 py-2.5 active:bg-secondary/40">
              <p className="text-[10px] font-semibold text-primary truncate">{preview.roomName}</p>
              <p className="text-xs text-foreground line-clamp-2 mt-0.5">{preview.content}</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
