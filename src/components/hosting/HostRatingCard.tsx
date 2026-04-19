'use client'

import { useState } from 'react'
import { Star, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface HostRatingCardProps {
  hostName: string
  hostAvatar?: string | null
  bookingId: string
  onSubmit?: (rating: number, comment: string) => Promise<void>
  onSkip?: () => void
}

export function HostRatingCard({
  hostName,
  hostAvatar,
  bookingId,
  onSubmit,
  onSkip,
}: HostRatingCardProps) {
  const [rating, setRating] = useState<number>(0)
  const [comment, setComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (rating === 0) {
      setError('Please select a rating')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      if (onSubmit) {
        await onSubmit(rating, comment)
      } else {
        const response = await fetch('/api/host-ratings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            booking_id: bookingId,
            rating,
            comment: comment || null,
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to submit rating')
        }
      }

      setIsSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit rating')
      console.error('Error submitting rating:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isSubmitted) {
    return (
      <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/20 rounded-xl p-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Check className="h-5 w-5 text-green-400" />
          <span className="text-lg font-bold text-green-400">Rating submitted!</span>
        </div>
        <p className="text-sm text-muted-foreground">Thank you for rating your host experience.</p>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div>
        <h3 className="text-lg font-bold mb-1">Rate Your Host</h3>
        <p className="text-sm text-muted-foreground">How was your experience with {hostName}?</p>
      </div>

      {/* Star rating selector */}
      <div className="flex justify-center gap-2 py-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => {
              setRating(star)
              setError(null)
            }}
            className="transition-transform hover:scale-110"
          >
            <Star
              className={cn(
                'h-8 w-8 transition-all',
                star <= rating
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-muted-foreground hover:text-amber-400'
              )}
            />
          </button>
        ))}
      </div>

      {rating > 0 && (
        <div className="text-center text-sm text-muted-foreground">
          {rating === 1 && "We're sorry to hear that."}
          {rating === 2 && "Thank you for your feedback."}
          {rating === 3 && "Thanks for rating!"}
          {rating === 4 && "Great! We're glad you enjoyed it."}
          {rating === 5 && "Excellent! Happy to hear!"}
        </div>
      )}

      {/* Comment textarea */}
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Share any additional comments (optional)"
        className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm min-h-20"
        maxLength={500}
      />
      <div className="text-xs text-muted-foreground text-right">{comment.length}/500</div>

      {error && (
        <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => onSkip?.()}
          disabled={isSubmitting}
          className="flex-1"
        >
          Skip
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || rating === 0}
          className="flex-1"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isSubmitting ? 'Submitting...' : 'Submit Rating'}
        </Button>
      </div>
    </div>
  )
}
