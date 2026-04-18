'use client'

import indiaMap from '@svg-maps/india'
import { cn } from '@/lib/utils'
import { stateMatchesSvgName } from '@/lib/indian-states'

type Loc = { id: string; name: string; path: string }

export function IndiaStatesMap({
  visitedStates,
  className,
  /** Inline SVG colors so raster export (e.g. html-to-image) does not lose Tailwind/CSS-variable fills */
  forRasterExport = false,
}: {
  visitedStates: Iterable<string>
  className?: string
  forRasterExport?: boolean
}) {
  const visited = [...visitedStates]
  const data = indiaMap as { viewBox: string; locations: Loc[] }

  return (
    <div
      className={cn(
        !forRasterExport &&
          'w-full overflow-hidden rounded-lg border border-border/60 bg-secondary/10',
        className,
      )}
      style={
        forRasterExport
          ? {
              width: '100%',
              overflow: 'hidden',
              borderRadius: 16,
              border: '1px solid rgba(202, 138, 4, 0.35)',
              background: 'rgba(255, 255, 255, 0.65)',
            }
          : undefined
      }
    >
      <svg
        viewBox={data.viewBox}
        className={cn(
          'h-auto w-full text-foreground',
          !forRasterExport && 'max-h-[220px]',
        )}
        style={forRasterExport ? { display: 'block', maxHeight: 320 } : undefined}
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
              className={
                forRasterExport
                  ? undefined
                  : cn(
                      'transition-colors duration-200 [vector-effect:non-scaling-stroke]',
                      isVisited
                        ? 'fill-primary/85 stroke-primary/40'
                        : 'fill-muted/30 stroke-border/80 dark:fill-zinc-600/45 dark:stroke-zinc-400',
                    )
              }
              style={
                forRasterExport
                  ? {
                      vectorEffect: 'non-scaling-stroke',
                      fill: isVisited ? 'rgba(202, 138, 4, 0.88)' : 'rgba(214, 211, 209, 0.45)',
                      stroke: isVisited ? 'rgba(180, 83, 9, 0.45)' : 'rgba(120, 113, 108, 0.55)',
                    }
                  : undefined
              }
              strokeWidth={forRasterExport ? 0.35 : 0.45}
            />
          )
        })}
      </svg>
    </div>
  )
}
