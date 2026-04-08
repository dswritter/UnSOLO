import { createClient } from '@/lib/supabase/server'
import { QueryProvider } from '@/providers/QueryProvider'
import { Navbar } from '@/components/layout/Navbar'
import { ChatNotificationWidget } from '@/components/chat/ChatNotificationWidget'
import { PresenceTracker } from '@/components/layout/PresenceTracker'
import { FooterWrapper } from '@/components/layout/FooterWrapper'
import type { Profile } from '@/types'

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let user: { id: string } | null = null
  let profile: Profile | null = null

  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    user = data.user
    if (user) {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      profile = p
    }
  } catch {
    // If Supabase is down, render page without auth
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar user={profile} />
      <main className="flex-1">
        <QueryProvider>{children}</QueryProvider>
      </main>
      {user && <ChatNotificationWidget userId={user.id} />}
      {user && <PresenceTracker userId={user.id} />}
      <FooterWrapper />
    </div>
  )
}
