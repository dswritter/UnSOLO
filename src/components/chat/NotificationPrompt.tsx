'use client'

import { useState, useEffect } from 'react'
import { Bell, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NotificationPrompt() {
  const [show, setShow] = useState(false)
  const [requesting, setRequesting] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission === 'default') {
      const t = setTimeout(() => setShow(true), 2000)
      return () => clearTimeout(t)
    }
  }, [])

  async function requestPermission() {
    setRequesting(true)
    const perm = await Notification.requestPermission()
    setRequesting(false)
    setShow(false)
    if (perm === 'granted') {
      new Notification('UnSOLO', {
        body: 'You\'ll now receive notifications for new messages!',
        icon: '/favicon.ico',
      })
    }
  }

  if (!show) return null

  return (
    <div className={`mx-4 mt-3 mb-1 p-3 rounded-xl bg-primary/10 border border-primary/30 flex items-center gap-3 shrink-0 transition-opacity ${requesting ? 'opacity-60' : ''}`}>
      <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
        <Bell className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">{requesting ? 'Requesting permission...' : 'Enable notifications'}</p>
        <p className="text-[10px] text-muted-foreground">Get alerted when you receive new messages</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" className="h-7 text-xs bg-primary text-black px-3" onClick={requestPermission} disabled={requesting}>
          {requesting ? (
            <span className="h-3 w-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
          ) : 'Allow'}
        </Button>
        {!requesting && (
          <button onClick={() => setShow(false)} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
