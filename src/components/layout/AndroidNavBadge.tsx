'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

declare global {
  interface Window {
    UnsoloNative?: {
      setTabBadge: (tab: string, count: number) => void
    }
  }
}

export function AndroidNavBadge({ userId }: { userId: string }) {
  const pathname = usePathname()

  useEffect(() => {
    if (!window.UnsoloNative?.setTabBadge) return
    const supabase = createClient()
    let cancelled = false
    let unread = 0

    async function loadUnread() {
      const { data: rooms } = await supabase
        .from('chat_room_members')
        .select('room_id, last_read_at')
        .eq('user_id', userId)
      if (cancelled || !rooms) return

      let count = 0
      await Promise.all(
        rooms.map(async (m) => {
          const { count: c } = await supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('room_id', m.room_id)
            .neq('user_id', userId)
            .neq('message_type', 'system')
            .gt('created_at', m.last_read_at ?? '1970-01-01')
          count += c ?? 0
        }),
      )
      if (!cancelled) {
        unread = count
        window.UnsoloNative?.setTabBadge('community', unread)
      }
    }

    loadUnread()

    const channel = supabase
      .channel('android-nav-badge')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload: { new: Record<string, unknown> }) => {
          const msg = payload.new as { user_id: string; room_id: string; message_type: string }
          if (msg.user_id === userId || msg.message_type === 'system') return
          const { data: membership } = await supabase
            .from('chat_room_members')
            .select('id')
            .eq('room_id', msg.room_id)
            .eq('user_id', userId)
            .maybeSingle()
          if (!membership || cancelled) return
          const onCommunity = pathname?.startsWith('/community') || pathname?.startsWith('/tribe')
          if (onCommunity) return
          unread += 1
          window.UnsoloNative?.setTabBadge('community', unread)
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [userId, pathname])

  // Clear badge when user is on the community/tribe pages
  useEffect(() => {
    if (!window.UnsoloNative?.setTabBadge) return
    if (pathname?.startsWith('/community') || pathname?.startsWith('/tribe')) {
      window.UnsoloNative.setTabBadge('community', 0)
    }
  }, [pathname])

  return null
}
