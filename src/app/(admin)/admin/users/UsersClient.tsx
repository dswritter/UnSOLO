'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { loadAdminUsersPage } from '@/actions/admin-users'
import type { AdminUserFilter, AdminUsersPage } from '@/lib/admin/users-query'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Search, Phone, Instagram, Mountain } from 'lucide-react'
import Link from 'next/link'

type FilterKey = AdminUserFilter

export function UsersClient({ initial }: { initial: AdminUsersPage }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [data, setData] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const firstRun = useRef(true)

  const load = useCallback(async (q: string, f: FilterKey, offset: number) => {
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const next = await loadAdminUsersPage(q, f, offset)
      if (id !== requestId.current) return
      setData(prev => offset === 0 ? next : { ...next, rows: [...prev.rows, ...next.rows] })
    } catch (e) {
      if (id === requestId.current) setError(e instanceof Error ? e.message : 'Could not load users')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    const timer = setTimeout(() => void load(search, filter, 0), search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [search, filter, load])

  const filtered = data.rows
  const users = data.rows
  const filters: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: data.counts.all },
    { key: 'hosts', label: 'Hosts', count: data.counts.hosts },
    { key: 'active_travelers', label: '1+ Trips', count: data.counts.active_travelers },
    { key: 'no_phone', label: 'No Phone', count: data.counts.no_phone },
    { key: 'no_instagram', label: 'No Instagram', count: data.counts.no_instagram },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Users ({data.counts.all})</h1>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by name or username…"
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

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><Phone className="h-3 w-3 text-green-400" /> Phone verified</span>
        <span className="flex items-center gap-1"><Instagram className="h-3 w-3 text-pink-400" /> Instagram linked</span>
        <span className="flex items-center gap-1"><Mountain className="h-3 w-3 text-primary" /> Verified host</span>
      </div>

      {/* User list */}
      <div className="space-y-1">
        {/* Header */}
        <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs text-muted-foreground font-medium border-b border-border">
          <div className="col-span-4">User</div>
          <div className="col-span-2">Joined</div>
          <div className="col-span-1 text-center">Trips</div>
          <div className="col-span-1 text-center">Cancelled</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Role</div>
        </div>

        {error ? <p role="alert" className="py-4 text-center text-sm text-red-400">{error}</p> : null}
        {filtered.length === 0 && !loading ? (
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
      <div className="mt-4 flex flex-col items-center gap-2">
        <p className="text-xs text-muted-foreground">Showing {users.length} of {data.total}</p>
        {users.length < data.total ? (
          <button type="button" disabled={loading} onClick={() => void load(search, filter, users.length)}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:border-primary/40 disabled:opacity-60">
            {loading ? 'Loading…' : 'Load more'}
          </button>
        ) : loading ? <p className="text-xs text-muted-foreground">Loading…</p> : null}
      </div>
    </div>
  )
}
