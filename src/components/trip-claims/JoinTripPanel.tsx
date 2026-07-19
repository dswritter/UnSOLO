'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { submitCompanionReview, submitTripClaim } from '@/actions/trip-claims'

export type JoinTripEligibility = 'can_claim' | 'pending'

/**
 * For a logged-in visitor who wasn't the account holder on any booking for
 * this trip: lets them either write a review (verified by the booking's
 * confirmation code — the same action also files the join request) or just
 * request to join the trip (chat + full booking visibility), without a review.
 * Not rendered at all if the viewer already has full access (own booking or
 * an approved claim) or isn't logged in — see packages/[slug]/page.tsx.
 */
export function JoinTripPanel({ packageId, eligibility }: { packageId: string; eligibility: JoinTripEligibility }) {
  const [mode, setMode] = useState<'closed' | 'review' | 'claim'>('closed')
  const [code, setCode] = useState('')
  const [ratingDest, setRatingDest] = useState(0)
  const [ratingExp, setRatingExp] = useState(0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [travellerName, setTravellerName] = useState('')
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState<'review' | 'claim' | null>(null)

  if (eligibility === 'pending' && !done) {
    return (
      <p className="text-xs text-muted-foreground border border-border rounded-lg p-3 bg-secondary/30">
        Your request to join this trip is awaiting approval from the booker, the trip host, or our team.
      </p>
    )
  }

  function submitReviewFlow() {
    if (!code.trim()) { toast.error('Enter the booking confirmation code.'); return }
    if (ratingDest === 0 || ratingExp === 0) { toast.error('Please rate both categories.'); return }
    startTransition(async () => {
      const res = await submitCompanionReview(packageId, code, ratingDest, ratingExp, title, body)
      if ('error' in res && res.error) { toast.error(res.error); return }
      toast.success(
        'published' in res && res.published
          ? 'Review published!'
          : 'Submitted — your review and join request are awaiting approval.',
      )
      setDone('review')
      setMode('closed')
    })
  }

  function submitClaimFlow() {
    if (!code.trim()) { toast.error('Enter the booking confirmation code.'); return }
    startTransition(async () => {
      const res = await submitTripClaim(packageId, code, travellerName || undefined)
      if ('error' in res && res.error) { toast.error(res.error); return }
      if ('alreadyApproved' in res && res.alreadyApproved) toast.success('You already have access to this trip.')
      else if ('alreadyPending' in res && res.alreadyPending) toast('Your request is already awaiting approval.')
      else toast.success('Request submitted — awaiting approval.')
      setDone('claim')
      setMode('closed')
    })
  }

  if (done) {
    return (
      <p className="text-xs text-muted-foreground border border-border rounded-lg p-3 bg-secondary/30">
        Your request is in — we&apos;ll notify you once it&apos;s approved.
      </p>
    )
  }

  if (mode === 'closed') {
    return (
      <div className="border border-dashed border-border rounded-lg p-4 space-y-2">
        <p className="text-sm font-medium">Were you on this trip, booked under someone else&apos;s account?</p>
        <p className="text-xs text-muted-foreground">
          Enter the booking&apos;s confirmation code to write a review, or just to join the trip chat and see the booking
          details. Needs approval from the booker, the trip host, or our team.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setMode('review')}>Write a review</Button>
          <Button size="sm" variant="outline" onClick={() => setMode('claim')}>Just join (no review)</Button>
        </div>
      </div>
    )
  }

  const codeInput = (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">Booking confirmation code (e.g. UNS-2026-9MUG)</label>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="UNS-2026-XXXX"
        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm font-mono uppercase"
      />
    </div>
  )

  if (mode === 'claim') {
    return (
      <div className="border border-border rounded-lg p-4 space-y-3">
        <p className="text-sm font-medium">Join this trip</p>
        {codeInput}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Which traveller are you? (optional, helps approval)</label>
          <input
            value={travellerName}
            onChange={(e) => setTravellerName(e.target.value)}
            placeholder="Your name as it appears on the booking"
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={submitClaimFlow} disabled={isPending}>{isPending ? 'Submitting…' : 'Submit request'}</Button>
          <Button size="sm" variant="outline" onClick={() => setMode('closed')} disabled={isPending}>Cancel</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <p className="text-sm font-medium">Write a review — verify with the confirmation code</p>
      {codeInput}
      <div className="grid grid-cols-2 gap-3">
        <StarRow value={ratingDest} onChange={setRatingDest} label="Destination" />
        <StarRow value={ratingExp} onChange={setRatingExp} label="Experience" />
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Share your experience…"
        rows={3}
        className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm resize-none"
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={submitReviewFlow} disabled={isPending}>{isPending ? 'Submitting…' : 'Submit review'}</Button>
        <Button size="sm" variant="outline" onClick={() => setMode('closed')} disabled={isPending}>Cancel</Button>
      </div>
    </div>
  )
}

function StarRow({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" onClick={() => onChange(i)}>
            <Star className={`h-5 w-5 ${i <= value ? 'text-primary fill-primary' : 'text-white/30'}`} />
          </button>
        ))}
      </div>
    </div>
  )
}
