'use client'

import { Card, CardContent } from '@/components/ui/card'
import { MapPin, Lock } from 'lucide-react'
import { IndiaStatesMap } from '@/components/profile/IndiaStatesMap'
import { INDIAN_STATES } from '@/lib/indian-states'

export function StatesExploredCard({
  visitedStates,
  statesPrivate,
  emptyMessage,
}: {
  visitedStates: string[]
  statesPrivate: boolean
  emptyMessage: string
}) {
  const count = visitedStates.length
  return (
    <Card className="bg-card border-border py-0">
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-bold">
            <MapPin className="h-4 w-4 text-primary" /> States explored
            {statesPrivate && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Private" />}
          </h2>
          {!statesPrivate ? (
            <span className="text-xs tabular-nums text-muted-foreground">{count} / {INDIAN_STATES.length}</span>
          ) : null}
        </div>
        {statesPrivate ? (
          <p className="text-sm text-muted-foreground">Explored states are private.</p>
        ) : count === 0 ? (
          <div className="flex items-center gap-4">
            <IndiaStatesMap visitedStates={[]} className="w-20 shrink-0 border-0 bg-transparent opacity-60" />
            <p className="text-sm leading-snug text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <IndiaStatesMap visitedStates={visitedStates} />
            <div className="flex flex-wrap gap-1.5">
              {visitedStates.map((state) => (
                <span key={state} className="rounded-md border border-primary/30 bg-primary/15 px-2 py-1 text-[11px] font-medium text-primary">
                  {state}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
