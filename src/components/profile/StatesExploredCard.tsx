'use client'

import { Card, CardContent } from '@/components/ui/card'
import { MapPin, Lock } from 'lucide-react'
import { IndiaStatesMap } from '@/components/profile/IndiaStatesMap'
import { INDIAN_STATES, visitedIncludesState } from '@/lib/indian-states'
import { cn } from '@/lib/utils'

export function StatesExploredCard({
  visitedStates,
  statesPrivate,
}: {
  visitedStates: string[]
  statesPrivate: boolean
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5">
        <h2 className="font-bold mb-4 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" /> States Explored
          {statesPrivate && <Lock className="h-3 w-3 text-muted-foreground" />}
        </h2>
        {statesPrivate ? (
          <p className="text-sm text-muted-foreground">
            This user has made their explored states private.
          </p>
        ) : (
          <div className="space-y-4">
            <IndiaStatesMap visitedStates={visitedStates} />
            <div className="flex flex-wrap gap-1.5">
              {INDIAN_STATES.map((state) => {
                const visited = visitedIncludesState(state, visitedStates)
                return (
                  <span
                    key={state}
                    className={cn(
                      'px-2 py-1 rounded-md text-[10px] font-medium border transition-colors',
                      visited
                        ? 'bg-primary/15 text-primary border-primary/30'
                        : 'bg-secondary/20 text-muted-foreground/50 border-border/30',
                    )}
                  >
                    {state}
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
