'use client'

import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Search, Phone, Instagram, Mountain } from 'lucide-react'
import Link from 'next/link'

interface UserEntry {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  phone_number: string | null
  is_host: boolean | null
  is_phone_verified: boolean | null
  instagram_url: string | null
  created_at: string
  role: string
  bookings: { confirmed: number; completed: number; cancelled: number }
  totalTrips: number
}

type FilterKey = 'all' | 'hosts' | 'no_instagram' | 'no_phone' | 'active_travelers'

export function UsersClient({ users }: { users: UserEntry[] }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')

  const filtered = users.filter(u => {
    if (filter === 'hosts' && !u.is_host) return false
    if (filter === 'no_instagram' && u.instagram_url) return false
    if (filter === 'no_phone' && u.is_phone_verified) return false
    if (filter === 'active_travelers' && u.totalTrips === 0) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (u.full_name || '').toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q)
    }
    return true
  })

  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: users.length },
    { key: 'hosts', label: 'Hosts', count: users.filter(u => u.is_host).length },
    { key: 'active_travelers', label: '1+ Trips', count: users.filter(u => u.totalTrips > 0).length },
    { key: 'no_phone', label: 'No Phone', count: users.filter(u => !u.is_phone_verified).length },
    { key: 'no_instagram', label: 'No Instagram', count: users.filter(u => !u.instagram_url).length },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Users ({users.length})</h1>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by name, username, or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 text-sm bg-card border border-border rounded-xl focus:outline-none focus:border-primary"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f.key ? 'bg-primary text-black' : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* User list */}
      <div className="space-y-1">
        {/* Header */}
        <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs text-muted-foreground font-medium border-b border-border">
          <div className="col-span-4">User</div>
          <div className="col-span-2">Joined</div>
          <div className="col-span-1 text-center">Trips</div>
          <div className="col-span-1 text-center">Cancelled</div>
          <div className="col-span-2">Verified</div>
          <div className="col-span-2">Role</div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No users match your search.</p>
        ) : (
          filtered.map(u => (
            <Link
              key={u.id}
              href={`/profile/${u.username}`}
              className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-lg hover:bg-secondary/50 transition-colors"
            >
              <div className="col-span-4 flex items-center gap-2 min-w-0">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={u.avatar_url || ''} />
                  <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-bold">
                    {(u.full_name || u.username).charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{u.full_name || u.username}</div>
                  <div className="text-[10px] text-muted-foreground truncate">@{u.username}</div>
                </div>
              </div>
              <div className="col-span-2 text-xs text-muted-foreground">
                {new Date(u.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
              </div>
              <div className="col-span-1 text-center text-xs font-bold text-primary">{u.totalTrips}</div>
              <div className="col-span-1 text-center text-xs text-red-400">{u.bookings.cancelled || 0}</div>
              <div className="col-span-2 flex gap-1">
                {u.is_phone_verified && <Phone className="h-3 w-3 text-green-400" />}
                {u.instagram_url && <Instagram className="h-3 w-3 text-pink-400" />}
                {u.is_host && <Mountain className="h-3 w-3 text-primary" />}
              </div>
              <div className="col-span-2">
                <Badge className={`text-[10px] ${u.role === 'admin' ? 'bg-red-900/50 text-red-300 border-red-700' : 'bg-secondary text-muted-foreground'}`}>
                  {u.role}
                </Badge>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
