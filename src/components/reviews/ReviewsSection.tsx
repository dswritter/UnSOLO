'use client'

import { useState } from 'react'
import { Star, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import type { Review } from '@/types'
import { EditableReviewCard } from './EditableReviewCard'
import { formatDate } from '@/lib/utils'

interface ReviewsSectionProps {
  reviews: (Review & { user?: { id?: string; username: string; full_name: string | null; avatar_url: string | null } })[]
  averageRating: number
  averageDestination: number
  averageExperience: number
  currentUserId: string | null
}

export function ReviewsSection({
  reviews,
  averageRating,
  averageDestination,
  averageExperience,
  currentUserId,
}: ReviewsSectionProps) {
  const [updatingReviewId, setUpdatingReviewId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleUpdateReview = async (review: Review) => {
    setUpdatingReviewId(review.id)
    setErrorMessage(null)
    try {
      const response = await fetch(`/api/reviews/${review.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: review.rating,
          title: review.title,
          body: review.body,
        }),
      })
      if (!response.ok) {
        throw new Error('Failed to update review')
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to update review')
      console.error('Error updating review:', error)
    } finally {
      setUpdatingReviewId(null)
    }
  }

  return (
    <div id="review" className="bg-card border border-border rounded-xl p-6">
      <h2 className="text-xl font-bold mb-4">
        Reviews {reviews?.length ? `(${reviews.length})` : ''}
      </h2>

      {errorMessage && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {errorMessage}
        </div>
      )}

      {reviews && reviews.length > 0 ? (
        <>
          {/* Rating summary */}
          <div className="grid grid-cols-3 gap-3 mb-6 p-4 bg-secondary/30 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-black text-primary">{averageRating.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">Overall</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">{averageDestination.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">Destination</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">{averageExperience.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">Experience</div>
            </div>
          </div>

          {/* Reviews list */}
          <div className="space-y-6">
            {reviews.map((review) => {
              const isOwnReview = currentUserId && review.user_id === currentUserId
              return (
                <div key={review.id} className="border-b border-border pb-6 last:border-0">
                  {/* Author info */}
                  <div className="flex items-center gap-3 mb-3">
                    <Link href={`/profile/${review.user?.username || ''}`} className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary hover:ring-2 hover:ring-primary/40 transition-all flex-shrink-0">
                      {review.user?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={review.user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        (review.user?.full_name || review.user?.username || 'U')[0].toUpperCase()
                      )}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link href={`/profile/${review.user?.username || ''}`} className="text-sm font-medium hover:text-primary transition-colors">
                        {review.user?.full_name || review.user?.username}
                      </Link>
                      <div className="text-xs text-muted-foreground">{formatDate(review.created_at)}</div>
                    </div>
                    {isOwnReview && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary whitespace-nowrap">Your review</span>
                    )}
                  </div>

                  {/* Rating display */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`h-4 w-4 ${i < review.rating ? 'text-primary fill-primary' : 'text-muted-foreground'}`} />
                      ))}
                    </div>
                    <span className="text-sm font-semibold text-foreground">{review.rating}/5</span>
                  </div>

                  {/* Editable review card */}
                  {isOwnReview ? (
                    <EditableReviewCard
                      review={review}
                      isOwnReview={true}
                      onUpdate={handleUpdateReview}
                    />
                  ) : (
                    <div className="space-y-2">
                      {review.title && <h4 className="font-semibold text-foreground">{review.title}</h4>}
                      {review.body && <p className="text-sm text-muted-foreground">{review.body}</p>}
                      {review.is_edited && (
                        <p className="text-xs text-muted-foreground italic">
                          Edited on {review.edited_at ? new Date(review.edited_at).toLocaleDateString() : ''}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">No reviews yet. Be the first to explore this trip!</p>
      )}
    </div>
  )
}
