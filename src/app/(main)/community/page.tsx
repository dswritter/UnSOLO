'use client'

import { useState, useEffect } from 'react'
import { searchCommunityMembers, getFrequentContacts } from '@/actions/profile'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { Search, MapPin, Users, Clock, MessageCircle } from 'lucide-react'
import { getInitials } from '@/lib/utils'
import Link from 'next/link'

type Member = {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  location: string | null
  messageCount?: number
}

function MemberCard({ member }: { member: Member }) {
  return (
    <Link href={`/profile/${member.username}`}>
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
          <div className="flex flex-col items-end gap-1">
            {member.location && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {member.location}
              </div>
            )}
            {member.messageCount && (
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <MessageCircle className="h-2.5 w-2.5" /> {member.messageCount} msgs
              </div>
            )}
          </div>
        </div>
        {member.bio && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-1">{member.bio}</p>
        )}
      </Card>
    </Link>
  )
}

export default function CommunityPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Member[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recentContacts, setRecentContacts] = useState<Member[]>([])
  const [frequentContacts, setFrequentContacts] = useState<Member[]>([])
  const [contactsLoading, setContactsLoading] = useState(true)

  // Load frequent & recent contacts on mount
  useEffect(() => {
    async function load() {
      try {
        const { recent, frequent } = await getFrequentContacts()
        setRecentContacts(recent as Member[])
        setFrequentContacts(frequent as Member[])
      } catch { /* ignore */ }
      setContactsLoading(false)
    }
    load()
  }, [])

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
    <div className="min-h-screen bg-background">
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

        {/* Search Results */}
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
              <MemberCard key={member.id} member={member} />
            ))}
          </div>
        )}

        {/* Frequent & Recent — only show when NOT searching */}
        {!searched && !loading && (
          <div className="space-y-8">
            {/* Frequent Contacts */}
            {!contactsLoading && frequentContacts.length > 0 && (
              <div>
                <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-primary" /> Frequent Contacts
                </h2>
                <div className="space-y-2">
                  {frequentContacts.map(member => (
                    <MemberCard key={member.id} member={member} />
                  ))}
                </div>
              </div>
            )}

            {/* Recent Contacts */}
            {!contactsLoading && recentContacts.length > 0 && (
              <div>
                <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" /> Recent Conversations
                </h2>
                <div className="space-y-2">
                  {recentContacts.map(member => (
                    <MemberCard key={member.id} member={member} />
                  ))}
                </div>
              </div>
            )}

            {contactsLoading && (
              <div className="text-center py-8 text-muted-foreground text-sm">Loading contacts...</div>
            )}

            {!contactsLoading && frequentContacts.length === 0 && recentContacts.length === 0 && (
              <div className="text-center py-16">
                <Users className="h-16 w-16 text-primary/20 mx-auto mb-4" />
                <p className="text-muted-foreground">Start chatting with members to see your contacts here</p>
                <p className="text-muted-foreground text-sm mt-1">Or search above to find fellow travelers</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
