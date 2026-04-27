'use client'

import { useEffect, useState } from 'react'
import { X, Pin, ExternalLink } from 'lucide-react'
import type { Message } from '@/types'
import { Button } from '@/components/ui/button'

const DISMISS_PREFIX = 'unsolo:pin-dismiss:'

function dismissKey(roomId: string, messageId: string) {
  return `${DISMISS_PREFIX}${roomId}:${messageId}`
}

export function PinnedMessageBanner({
  roomId,
  message,
  canUnpin,
  onRequestUnpin,
}: {
  roomId: string
  message: Message
  canUnpin: boolean
  /** Parent clears pinned UI immediately and runs the server unpin in the background. */
  onRequestUnpin?: () => void
}) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setHidden(localStorage.getItem(dismissKey(roomId, message.id)) === '1')
  }, [roomId, message.id])

  if (message.message_type === 'poll' || message.message_type === 'system' || hidden) return null

  function dismiss() {
    try {
      localStorage.setItem(dismissKey(roomId, message.id), '1')
    } catch { /* storage full */ }
    setHidden(true)
  }

  function viewInChat() {
    const el = document.getElementById(`chat-msg-${message.id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="shrink-0 border-b border-primary/30 bg-primary/5 px-3 py-2 flex gap-2 items-start">
      <Pin className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold text-primary uppercase tracking-wide">Pinned by Admin</p>
        <p className="text-xs text-foreground/90 line-clamp-3 mt-0.5 break-words">
          {message.message_type === 'image' ? 'Photo' : message.content}
        </p>
        <div className="flex flex-wrap gap-2 mt-1.5">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 text-xs gap-1"
            onClick={viewInChat}
          >
            <ExternalLink className="h-3 w-3" />
            View in chat
          </Button>
          {canUnpin && onRequestUnpin ? (
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onRequestUnpin()}>
              Unpin
            </Button>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="p-1 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-foreground shrink-0"
        aria-label="Hide pinned preview"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
