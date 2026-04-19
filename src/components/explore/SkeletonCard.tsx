'use client'

import { cn } from '@/lib/utils'

interface SkeletonCardProps {
  variant?: 'trip' | 'service'
}

export function SkeletonCard({ variant = 'trip' }: SkeletonCardProps) {
  return (
    <div className="animate-pulse">
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Image skeleton */}
        <div className="h-52 bg-secondary" />

        {/* Content skeleton */}
        <div className="p-4 space-y-3">
          {/* Title */}
          <div className="h-6 bg-secondary rounded-lg w-3/4" />

          {/* Description */}
          <div className="space-y-2">
            <div className="h-4 bg-secondary rounded-lg w-full" />
            <div className="h-4 bg-secondary rounded-lg w-5/6" />
          </div>

          {/* Bottom info */}
          <div className="flex justify-between pt-2">
            <div className="h-5 bg-secondary rounded-lg w-1/3" />
            <div className="h-5 bg-secondary rounded-lg w-1/4" />
          </div>
        </div>
      </div>
    </div>
  )
}
