'use client'

import { useState } from 'react'
import { searchCommunityMembers } from '@/actions/profile'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { Search, MapPin, Users } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import Link from 'next/link'

type Member = {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  location: string | null
}

export default function CommunityPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Member[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSearch(value: string) {
    setQuery(value)
    if (value.trim().length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    setLoading(true)
    const data = await searchCommunityMembers(value)
    setResults(data as Member[])
    setSearched(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black">
            <span className="text-primary">Community</span> Members
          </h1>
          <p className="text-muted-foreground mt-1">Find and connect with fellow travelers</p>
        </div>

        {/* Search bar */}
        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or username..."
            value={query}
            onChange={e => handleSearch(e.target.value)}
            className="bg-card border-border pl-10 h-12 text-base"
          />
        </div>

        {/* Results */}
        {loading && (
          <div className="text-center py-8 text-muted-foreground text-sm">Searching...</div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-primary/30 mx-auto mb-3" />
            <p className="text-muted-foreground">No members found matching &quot;{query}&quot;</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-3">
            {results.map(member => (
              <Link key={member.id} href={`/profile/${member.username}`}>
                <Card className="bg-card border-border hover:border-primary/40 transition-colors cursor-pointer p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={member.avatar_url || ''} />
                      <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
                        {getInitials(member.full_name || member.username)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{member.full_name || member.username}</div>
                      <div className="text-xs text-muted-foreground">@{member.username}</div>
                    </div>
                    {member.location && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {member.location}
                      </div>
                    )}
                  </div>
                  {member.bio && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-1">{member.bio}</p>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        )}

        {!searched && !loading && (
          <div className="text-center py-16">
            <Users className="h-16 w-16 text-primary/20 mx-auto mb-4" />
            <p className="text-muted-foreground">Type at least 2 characters to search for community members</p>
          </div>
        )}
      </div>
    </div>
  )
}
