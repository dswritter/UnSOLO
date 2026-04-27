'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, X, MessageCircle, CreditCard, Phone, Users } from 'lucide-react'
import { cn, timeAgo } from '@/lib/utils'
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

/** `below` = under trigger (navbar). `above` = opens upward (e.g. bell at bottom of admin sidebar). */
export function NotificationBell({
  userId,
  placement = 'below',
  wanderNav = false,
}: {
  userId: string
  placement?: 'below' | 'above'
  /** Forest-green bar on /wander: bright bell + light hit area */
  wanderNav?: boolean
}) {
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
        className={cn(
          'relative rounded-lg p-2 transition-colors',
          wanderNav ? 'hover:bg-white/10' : 'hover:bg-secondary',
        )}
        type="button"
        aria-expanded={open}
        aria-label="Notifications"
      >
        <Bell
          className={cn('h-5 w-5', wanderNav ? 'text-white' : 'text-muted-foreground')}
        />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            'rounded-xl shadow-2xl overflow-hidden z-[200]',
            wanderNav
              ? 'bg-primary text-primary-foreground border-2 border-primary-foreground/25'
              : 'bg-card border border-border text-card-foreground',
            placement === 'below'
              ? 'fixed left-2 right-2 top-14 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80'
              : 'absolute right-0 bottom-full mb-2 w-[min(20rem,calc(100vw-1rem))] sm:w-80 max-h-[min(85vh,calc(100vh-2rem))] flex flex-col',
          )}
        >
          <div
            className={cn(
              'px-4 py-3 flex items-center justify-between border-b',
              wanderNav ? 'border-primary-foreground/20' : 'border-border',
            )}
          >
            <span className="text-sm font-black tracking-tight">Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className={cn(
                    'text-[10px] font-semibold hover:underline',
                    wanderNav ? 'text-primary-foreground/85 hover:text-primary-foreground' : 'text-primary',
                  )}
                >
                  Mark all read
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} className={cn(wanderNav && 'rounded-md p-0.5 hover:bg-primary-foreground/10')}>
                <X
                  className={cn(
                    'h-3.5 w-3.5',
                    wanderNav ? 'text-primary-foreground/75 hover:text-primary-foreground' : 'text-zinc-500',
                  )}
                />
              </button>
            </div>
          </div>

          <div className={cn('min-h-0 overflow-y-auto', placement === 'above' ? 'max-h-72 sm:max-h-80' : 'max-h-80')}>
            {notifications.length === 0 ? (
              <div
                className={cn(
                  'px-4 py-8 text-center text-sm',
                  wanderNav ? 'text-primary-foreground/70' : 'text-muted-foreground',
                )}
              >
                No notifications yet
              </div>
            ) : (
              notifications.map(n => {
                const Icon = TYPE_ICONS[n.type] || Bell
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => onNotificationClick(n)}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 w-full text-left transition-colors border-b last:border-0',
                      wanderNav
                        ? cn(
                            'border-primary-foreground/15 hover:bg-primary-foreground/10',
                            !n.is_read && 'bg-primary-foreground/[0.12]',
                          )
                        : cn(
                            'border-border/50 hover:bg-secondary/30',
                            !n.is_read && 'bg-primary/5',
                          ),
                    )}
                  >
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                        wanderNav
                          ? !n.is_read
                            ? 'bg-primary-foreground/22'
                            : 'bg-primary-foreground/12'
                          : !n.is_read
                            ? 'bg-primary/20'
                            : 'bg-secondary',
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4',
                          wanderNav
                            ? 'text-primary-foreground'
                            : !n.is_read
                              ? 'text-primary'
                              : 'text-muted-foreground',
                        )}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={cn(
                            'text-xs truncate',
                            wanderNav
                              ? !n.is_read
                                ? 'font-bold text-primary-foreground'
                                : 'text-primary-foreground/80'
                              : !n.is_read
                                ? 'font-semibold text-foreground'
                                : 'text-muted-foreground',
                          )}
                        >
                          {n.title}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] shrink-0',
                            wanderNav ? 'text-primary-foreground/60' : 'text-muted-foreground',
                          )}
                        >
                          {timeAgo(n.created_at)}
                        </span>
                      </div>
                      {n.body && (
                        <p
                          className={cn(
                            'text-xs mt-0.5 line-clamp-3 break-words',
                            wanderNav ? 'text-primary-foreground/78' : 'text-muted-foreground',
                          )}
                        >
                          {n.body}
                        </p>
                      )}
                    </div>
                    {!n.is_read && (
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full flex-shrink-0 mt-2',
                          wanderNav ? 'bg-primary-foreground' : 'bg-primary',
                        )}
                      />
                    )}
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
