'use client'

import indiaMap from '@svg-maps/india'
import { cn } from '@/lib/utils'
import { stateMatchesSvgName } from '@/lib/indian-states'

type Loc = { id: string; name: string; path: string }

export function IndiaStatesMap({
  visitedStates,
  className,
}: {
  visitedStates: Iterable<string>
  className?: string
}) {
  const visited = [...visitedStates]
  const data = indiaMap as { viewBox: string; locations: Loc[] }

  return (
    <div
      className={cn(
        'w-full overflow-hidden rounded-lg border border-border/60 bg-secondary/10',
        className,
      )}
    >
      <svg
        viewBox={data.viewBox}
        className="h-auto w-full max-h-[220px] text-foreground"
        role="img"
        aria-label="Map of India with visited states highlighted"
      >
        <title>India — visited states</title>
        {data.locations.map((loc) => {
          const isVisited = visited.some((v) => stateMatchesSvgName(v, loc.name))
          return (
            <path
              key={loc.id}
              d={loc.path}
              className={cn(
                'stroke-border transition-colors duration-200 [vector-effect:non-scaling-stroke]',
                isVisited
                  ? 'fill-primary/85 stroke-primary/40'
                  : 'fill-muted/25 stroke-border/80',
              )}
              strokeWidth={0.35}
            />
          )
        })}
      </svg>
    </div>
  )
}
