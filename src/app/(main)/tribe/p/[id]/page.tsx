import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { getPostPage } from '@/lib/tribe/server'
import { getRequestAuth, getRequestProfile } from '@/lib/auth/request-session'
import { PostDetailClient } from '@/components/tribe/PostDetailClient'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  if (!UUID.test(id)) return {}
  const page = await getPostPage(id)
  if (!page) return { title: 'Post not found · UnSOLO' }
  const p = page.post
  const title = p.kind === 'plan'
    ? `${p.author.name.split(' ')[0]} needs ${Math.max((p.spotsTotal ?? 0) - p.memberCount, 0)} for ${p.place?.name ?? 'a trip'}`
    : p.title ?? p.body.slice(0, 60)
  return {
    title: `${title} · UnSOLO Tribe`,
    description: p.body.slice(0, 160),
    // Plans are personal and time-bound: never index them (spec: SEO covers stories + asks only).
    robots: p.kind === 'plan' ? { index: false, follow: false } : undefined,
    openGraph: { title, description: p.body.slice(0, 160), images: p.media[0] ? [p.media[0].url] : undefined },
  }
}

export default async function PostPage({ params }: Props) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const [page, { user }] = await Promise.all([getPostPage(id), getRequestAuth()])
  if (!page) notFound()
  const profile = user ? await getRequestProfile(user.id) : null
  return (
    <Suspense>
      <PostDetailClient
        post={page.post}
        comments={page.comments}
        offers={page.offers}
        signedIn={page.signedIn}
        viewerId={page.viewerId}
        viewerName={profile?.full_name || profile?.username || null}
        demo={page.demo}
      />
    </Suspense>
  )
}
