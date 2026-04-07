'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, X, Check, MessageCircle, CreditCard, Phone, Users } from 'lucide-react'
import { timeAgo } from '@/lib/utils'
import { useRouter } from 'next/navigation'

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  is_read: boolean
  created_at: string
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  message: MessageCircle,
  booking: CreditCard,
  phone_request: Phone,
  group_invite: Users,
  split_payment: CreditCard,
}

export function NotificationBell({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Load notifications
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()

    async function load() {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (data) {
        setNotifications(data as Notification[])
        setUnreadCount(data.filter((n: Notification) => !n.is_read).length)
      }
    }

    load()

    // Subscribe to new notifications via realtime
    const channel = supabase
      .channel(`notif-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload: { new: Record<string, unknown> }) => {
          const n = payload.new as unknown as Notification
          setNotifications(prev => [n, ...prev].slice(0, 20))
          setUnreadCount(c => c + 1)

          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(n.title, { body: n.body || undefined, icon: '/favicon.ico' })
          }
        }
      )
      .subscribe()

    // Also poll every 15s as fallback (realtime can miss events with RLS)
    const pollInterval = setInterval(load, 15000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [userId])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function markAllRead() {
    const supabase = createClient()
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  async function onNotificationClick(n: Notification) {
    // Mark as read immediately and update badge
    if (!n.is_read) {
      const supabase = createClient()
      const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
      if (!error) {
        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
        setUnreadCount(c => Math.max(0, c - 1))
      }
    }
    if (n.link) {
      window.dispatchEvent(new Event('unsolo:navigate'))
      router.push(n.link)
    }
    setOpen(false)
  }

  // Request browser notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
      >
        <Bell className="h-5 w-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-14 sm:top-full sm:mt-2 sm:w-80 bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-bold">Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[10px] text-primary hover:underline">
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)}>
                <X className="h-3.5 w-3.5 text-zinc-500" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              notifications.map(n => {
                const Icon = TYPE_ICONS[n.type] || Bell
                return (
                  <button
                    key={n.id}
                    onClick={() => onNotificationClick(n)}
                    className={`flex items-start gap-3 px-4 py-3 w-full text-left hover:bg-secondary/30 transition-colors border-b border-border/50 last:border-0 ${
                      !n.is_read ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      !n.is_read ? 'bg-primary/20' : 'bg-secondary'
                    }`}>
                      <Icon className={`h-4 w-4 ${!n.is_read ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs font-medium truncate ${!n.is_read ? 'text-white' : 'text-muted-foreground'}`}>
                          {n.title}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(n.created_at)}</span>
                      </div>
                      {n.body && <p className="text-xs text-muted-foreground truncate mt-0.5">{n.body}</p>}
                    </div>
                    {!n.is_read && <span className="h-2 w-2 bg-primary rounded-full flex-shrink-0 mt-2" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
