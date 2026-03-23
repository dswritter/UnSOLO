'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Zap } from 'lucide-react'
import Link from 'next/link'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'

interface ActiveUser {
  user_id: string
  username: string
  full_name: string | null
  avatar_url: string | null
}

export function ActiveUnSOLOs({ currentUserId }: { currentUserId: string }) {
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([])

  useEffect(() => {
    const supabase = createClient()

    async function fetchOnline() {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('user_presence')
        .select('user_id, profile:profiles(id, username, full_name, avatar_url)')
        .eq('is_online', true)
        .gte('last_seen', fiveMinAgo)
        .neq('user_id', currentUserId)

      if (data) {
        const users: ActiveUser[] = data
          .filter(d => d.profile)
          .map(d => {
            const p = d.profile as unknown as { id: string; username: string; full_name: string | null; avatar_url: string | null }
            return { user_id: d.user_id, username: p.username, full_name: p.full_name, avatar_url: p.avatar_url }
          })
        setActiveUsers(users)
      }
    }

    fetchOnline()

    // Subscribe to changes in user_presence table
    const channel = supabase
      .channel('active-unsolos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_presence' },
        () => {
          // Re-fetch on any presence change
          fetchOnline()
        }
      )
      .subscribe()

    // Also poll every 15s as backup
    const interval = setInterval(fetchOnline, 15000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [currentUserId])

  if (activeUsers.length === 0) return null

  return (
    <div className="mb-8">
      <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
        <Zap className="h-5 w-5 text-green-400" /> Active UnSOLOs
        <span className="text-xs text-green-400 font-normal ml-1">({activeUsers.length} online)</span>
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 pt-1 scrollbar-hide">
        {activeUsers.map(u => (
          <Link key={u.user_id} href={`/profile/${u.username}`} className="flex-shrink-0">
            <div className="flex flex-col items-center gap-1.5 w-16 text-center">
              <div className="relative">
                <div className="rounded-full p-0.5 bg-gradient-to-br from-green-400 to-green-600">
                  <Avatar className="h-12 w-12 border-2 border-background">
                    <AvatarImage src={u.avatar_url || ''} />
                    <AvatarFallback className="bg-primary/20 text-primary text-sm font-bold">
                      {getInitials(u.full_name || u.username)}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <span className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 rounded-full border-2 border-background" />
              </div>
              <span className="text-xs text-muted-foreground truncate w-full">{u.full_name || u.username}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
