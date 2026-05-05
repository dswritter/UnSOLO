export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getRequestAuth, getRequestProfile } from '@/lib/auth/request-session'
import {
  getStatusStripForHome,
  getMyGeneralRoomsForStatus,
  countActiveStatusStoriesForUser,
} from '@/actions/statusStories'
import { StatusStoriesBar } from '@/components/status/StatusStoriesBar'

/**
 * Dedicated status sheet, reachable from the Status button in the chat
 * bottom bar (and shareable via URL). Renders the same StatusStoriesBar used
 * on the home rail but full-width with a clear back affordance.
 */
export default async function StatusPage() {
  const { user } = await getRequestAuth()
  if (!user) redirect('/login?redirectTo=/status')

  const profile = await getRequestProfile(user.id).catch(() => null)
  const [{ stories, currentUserId, seenStoryIds }, generalRooms, existingActiveCount] = await Promise.all([
    getStatusStripForHome(),
    getMyGeneralRoomsForStatus(),
    countActiveStatusStoriesForUser(),
  ])
  if (!currentUserId) redirect('/login?redirectTo=/status')

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[820px] flex-col px-4 pb-16 pt-4 text-foreground sm:px-6">
      <header className="flex items-center gap-3 mb-4">
        <Link
          href="/community"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/14 bg-white/[0.06] text-white"
          aria-label="Back to chats"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-black tracking-tight">Status</h1>
          <p className="text-xs text-muted-foreground">Recent stories from people you follow</p>
        </div>
      </header>

      <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md px-3 py-3">
        <StatusStoriesBar
          initialStories={stories}
          currentUserId={currentUserId}
          seenStoryIds={seenStoryIds}
          generalRooms={generalRooms}
          addSlotAvatarUrl={profile?.avatar_url ?? null}
          existingActiveCount={existingActiveCount}
          maxOtherAuthors={24}
        />
      </div>

      {stories.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          No active stories yet. When people you follow post a status, it'll appear here.
        </p>
      ) : null}
    </div>
  )
}
