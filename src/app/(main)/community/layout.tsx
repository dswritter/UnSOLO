export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CommunitySidebarSection } from '@/components/chat/CommunitySidebarSection'
import { TribeMessageCacheBootstrap } from '@/components/chat/TribeMessageCacheBootstrap'

function CommunitySidebarSkeleton() {
  return (
    <div className="hidden md:flex w-96 min-w-[384px] border-r border-border shrink-0 flex-col p-4 gap-3">
      <div className="h-8 w-40 rounded-lg bg-muted animate-pulse mb-2" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-full bg-muted animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-3/4 max-w-[200px] rounded bg-muted animate-pulse" />
            <div className="h-3 w-1/2 max-w-[120px] rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default async function CommunityLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, role')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/login')

  return (
    <div className="h-[calc(100dvh-64px)] flex bg-background text-foreground min-h-0 relative">
      <TribeMessageCacheBootstrap />
      <Suspense fallback={<CommunitySidebarSkeleton />}>
        <CommunitySidebarSection userId={user.id} />
      </Suspense>
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
