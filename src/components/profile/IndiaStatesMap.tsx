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
  /** Max SVG height (px) when `forRasterExport` — share poster passes a larger value */
  rasterMaxHeightPx = 320,
}: {
  visitedStates: Iterable<string>
  className?: string
  forRasterExport?: boolean
  rasterMaxHeightPx?: number
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
              overflow: 'visible',
              borderRadius: 0,
              border: 'none',
              background: 'transparent',
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
        style={forRasterExport ? { display: 'block', maxHeight: rasterMaxHeightPx } : undefined}
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
                      fill: isVisited ? 'rgba(202, 138, 4, 0.88)' : 'rgba(200, 190, 175, 0.42)',
                      stroke: isVisited ? 'rgba(146, 64, 14, 0.55)' : 'rgba(70, 60, 50, 0.62)',
                    }
                  : undefined
              }
              strokeWidth={forRasterExport ? 0.55 : 0.45}
            />
          )
        })}
      </svg>
    </div>
  )
}
