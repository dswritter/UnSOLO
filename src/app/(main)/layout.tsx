import { createClient } from '@/lib/supabase/server'
import { Navbar } from '@/components/layout/Navbar'
import { ChatNotificationWidget } from '@/components/chat/ChatNotificationWidget'
import { PresenceTracker } from '@/components/layout/PresenceTracker'
import type { Profile } from '@/types'

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile: Profile | null = null
  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    profile = data
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar user={profile} />
      <main className="flex-1">{children}</main>
      {user && <ChatNotificationWidget userId={user.id} />}
      {user && <PresenceTracker userId={user.id} />}
    </div>
  )
}
