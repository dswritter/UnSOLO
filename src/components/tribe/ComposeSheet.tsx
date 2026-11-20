'use client'

import Link from 'next/link'
import { Camera, ChartBar, MessageCircleQuestionMark, UsersRound } from 'lucide-react'
import { Sheet } from './Sheet'

export type ComposeKind = 'plan' | 'story' | 'ask' | 'poll'

export const COMPOSE_KINDS: { id: ComposeKind; title: string; body: string; href: string; icon: typeof Camera }[] = [
  { id: 'plan', title: 'Plan', body: 'Find people for a trip you’re planning', href: '/tribe/new?kind=plan', icon: UsersRound },
  { id: 'story', title: 'Story', body: 'Photos and tips from a trip, stays on your profile', href: '/tribe/new?kind=story', icon: Camera },
  { id: 'ask', title: 'Question', body: 'Ask travellers and hosts', href: '/tribe/new?kind=ask', icon: MessageCircleQuestionMark },
  { id: 'poll', title: 'Poll', body: 'Let the tribe vote', href: '/tribe/new?kind=ask&poll=1', icon: ChartBar },
]

/** The four kinds as tiles. `onPick` makes them buttons (composer step 1); otherwise they link to the composer. */
export function KindTiles({ onPick, onNavigate }: { onPick?: (k: ComposeKind) => void; onNavigate?: () => void }) {
  return (
    <div className="fc-kinds">
      {COMPOSE_KINDS.map((k) => {
        const inner = (
          <>
            <span className="fc-kind-ic" aria-hidden><k.icon className="h-5 w-5" strokeWidth={2.25} /></span>
            <b>{k.title}</b>
            <span>{k.body}</span>
          </>
        )
        return onPick
          ? <button key={k.id} type="button" className="fc-kindtile" onClick={() => onPick(k.id)}>{inner}</button>
          : <Link key={k.id} href={k.href} className="fc-kindtile" onClick={onNavigate}>{inner}</Link>
      })}
    </div>
  )
}

/**
 * "What are you sharing?" — opened by the centre (+) tab and the desktop Post button.
 * Bottom sheet on phones, centred dialog from 768px. Each option opens /tribe/new with its kind.
 */
export function ComposeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="What are you sharing?" description="Everything goes to Tribe. Plans are for finding people, not for selling trips.">
      <div className="mt-4"><KindTiles onNavigate={onClose} /></div>
      <button type="button" className="pc-btn pc-btn-quiet pc-btn-block mt-4 md:hidden" onClick={onClose}>Cancel</button>
    </Sheet>
  )
}
