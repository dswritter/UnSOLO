import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MessageCircle, Users, Clock } from 'lucide-react'
import Link from 'next/link'
import { timeAgo } from '@/lib/utils'

export default async function ChatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get all general rooms
  const { data: generalRooms } = await supabase
    .from('chat_rooms')
    .select('*')
    .eq('type', 'general')
    .eq('is_active', true)

  // Get user's trip rooms
  const { data: memberRooms } = await supabase
    .from('chat_room_members')
    .select('room:chat_rooms(*, package:packages(title, destination:destinations(name, state)))')
    .eq('user_id', user.id)

  const tripRooms = (memberRooms || [])
    .map((m) => m.room as unknown as Record<string, unknown> | null)
    .filter((r): r is Record<string, unknown> => !!r && r['type'] === 'trip')

  // Get last message for each room user is a member of
  const allRoomIds = [
    ...tripRooms.map(r => String(r['id'])),
    ...(generalRooms || []).map(r => r.id),
  ].filter(Boolean)

  let lastMessages: Record<string, { content: string; created_at: string }> = {}
  if (allRoomIds.length > 0) {
    // Get last message per room (max 1 per room)
    for (const rid of allRoomIds) {
      const { data: msgs } = await supabase
        .from('messages')
        .select('content, created_at')
        .eq('room_id', rid)
        .order('created_at', { ascending: false })
        .limit(1)

      if (msgs?.[0]) {
        lastMessages[rid] = msgs[0]
      }
    }
  }

  // Sort rooms by last message time (recent first)
  type RoomWithMeta = {
    id: string
    name: string
    type: string
    lastMsg?: { content: string; created_at: string }
    pkg?: { title?: string; destination?: { name?: string; state?: string } } | null
  }

  const recentRooms: RoomWithMeta[] = [
    ...tripRooms.map(r => ({
      id: String(r['id']),
      name: String(r['name'] || 'Trip Chat'),
      type: 'trip',
      lastMsg: lastMessages[String(r['id'])],
      pkg: r['package'] as RoomWithMeta['pkg'],
    })),
    ...(generalRooms || []).map(r => ({
      id: r.id,
      name: r.name,
      type: 'general',
      lastMsg: lastMessages[r.id],
      pkg: null,
    })),
  ]
    .filter(r => r.lastMsg)
    .sort((a, b) => {
      const aTime = a.lastMsg?.created_at || ''
      const bTime = b.lastMsg?.created_at || ''
      return bTime.localeCompare(aTime)
    })

  const roomsWithoutMsg = [
    ...tripRooms.map(r => ({
      id: String(r['id']),
      name: String(r['name'] || 'Trip Chat'),
      type: 'trip',
      pkg: r['package'] as RoomWithMeta['pkg'],
    })),
    ...(generalRooms || []).map(r => ({
      id: r.id,
      name: r.name,
      type: 'general',
      pkg: null,
    })),
  ].filter(r => !lastMessages[r.id])

  return (
    <div className="min-h-screen bg-black">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black">
            <span className="text-primary">Community</span> Chat
          </h1>
          <p className="text-muted-foreground mt-1">Connect with fellow travelers in real-time</p>
        </div>

        {/* Recent chats */}
        {recentRooms.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" /> Recent Chats
            </h2>
            <div className="space-y-3">
              {recentRooms.map((room) => (
                <Link key={room.id} href={`/chat/${room.id}`}>
                  <Card className="bg-card border-border hover:border-primary/40 transition-colors cursor-pointer p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-xl shrink-0">
                        {room.type === 'trip' ? '🏔️' : '💬'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{room.name}</div>
                        {room.lastMsg && (
                          <p className="text-xs text-muted-foreground truncate">{room.lastMsg.content}</p>
                        )}
                      </div>
                      {room.lastMsg && (
                        <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(room.lastMsg.created_at)}</span>
                      )}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Trip rooms */}
        {tripRooms.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Your Trip Chats
            </h2>
            <div className="space-y-3">
              {tripRooms.map((room) => {
                const id = String(room['id'] || '')
                const name = String(room['name'] || 'Trip Chat')
                const pkg = room['package'] as { title?: string; destination?: { name?: string; state?: string } } | null
                return (
                  <Link key={id} href={`/chat/${id}`}>
                    <Card className="bg-card border-border hover:border-primary/40 transition-colors cursor-pointer p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-xl">
                          🏔️
                        </div>
                        <div>
                          <div className="font-medium">{name}</div>
                          {pkg?.destination && (
                            <div className="text-xs text-muted-foreground">
                              {pkg.destination.name}, {pkg.destination.state}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* General rooms */}
        <div>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" /> Community Rooms
          </h2>
          {generalRooms && generalRooms.length > 0 ? (
            <div className="space-y-3">
              {generalRooms.map((room) => (
                <Link key={room.id} href={`/chat/${room.id}`}>
                  <Card className="bg-card border-border hover:border-primary/40 transition-colors cursor-pointer p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-xl">
                        💬
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{room.name}</div>
                        <div className="text-xs text-muted-foreground">Community · Open to all</div>
                      </div>
                      <Button variant="outline" size="sm" className="border-border text-xs">
                        Join
                      </Button>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No community rooms yet. Check back soon!</p>
            </div>
          )}
        </div>

        {tripRooms.length === 0 && (
          <div className="mt-8 p-5 rounded-xl border border-border bg-card/50 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              Book a trip to join exclusive trip chat rooms with your fellow travelers.
            </p>
            <Button className="bg-primary text-black font-bold hover:bg-primary/90" asChild>
              <Link href="/explore">Explore Trips</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
