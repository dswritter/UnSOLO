'use client'

import { useState } from 'react'
import { Star, Edit2, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Review } from '@/types'

interface EditableReviewCardProps {
  review: Review
  isOwnReview: boolean
  onUpdate?: (review: Review) => Promise<void>
}

export function EditableReviewCard({ review, isOwnReview, onUpdate }: EditableReviewCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [rating, setRating] = useState(review.rating)
  const [title, setTitle] = useState(review.title || '')
  const [body, setBody] = useState(review.body || '')
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    if (!onUpdate) return
    setIsSaving(true)
    try {
      await onUpdate({
        ...review,
        rating,
        title: title || null,
        body: body || null,
      })
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to update review:', error)
    } finally {
      setIsSaving(false)
    }
  }

  if (isEditing && isOwnReview) {
    return (
      <div className="border border-border rounded-lg p-4 space-y-3">
        {/* Rating Editor */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Rating</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                className="transition-transform hover:scale-110"
              >
                <Star
                  className={cn(
                    'h-5 w-5',
                    star <= rating
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-muted-foreground'
                  )}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Title Editor */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Review title"
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm"
            maxLength={100}
          />
        </div>

        {/* Body Editor */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Review</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share your experience..."
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm min-h-24"
            maxLength={500}
          />
          <div className="text-xs text-muted-foreground text-right">{body.length}/500</div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 justify-end pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(false)}
            disabled={isSaving}
          >
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Check className="h-4 w-4 mr-1" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      {/* Rating Display */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={cn(
                  'h-4 w-4',
                  star <= review.rating
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-muted-foreground'
                )}
              />
            ))}
          </div>
          <span className="text-sm font-medium">{review.rating}/5</span>
        </div>
        {isOwnReview && (
          <button
            onClick={() => setIsEditing(true)}
            className="p-1 hover:bg-secondary rounded transition-colors"
            title="Edit review"
          >
            <Edit2 className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {/* Title */}
      {review.title && <h4 className="font-semibold text-foreground">{review.title}</h4>}

      {/* Body */}
      {review.body && <p className="text-sm text-muted-foreground">{review.body}</p>}

      {/* Edit Indicator */}
      {review.is_edited && (
        <p className="text-xs text-muted-foreground italic">
          Edited on {review.edited_at ? new Date(review.edited_at).toLocaleDateString() : ''}
        </p>
      )}

      {/* Author & Date */}
      <div className="text-xs text-muted-foreground pt-2 border-t border-border">
        <span className="font-medium">{review.user?.full_name || review.user?.username}</span>
        {' '}
        on {new Date(review.created_at).toLocaleDateString()}
      </div>
    </div>
  )
}
