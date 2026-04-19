'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const COVER_MENU_MIN_W = 200
const COVER_MENU_APPROX_H = 44
const COVER_LONG_PRESS_MS = 550

function clampCoverMenuPosition(clientX: number, clientY: number) {
  if (typeof window === 'undefined') return { x: clientX, y: clientY }
  const pad = 8
  return {
    x: Math.max(pad, Math.min(clientX, window.innerWidth - COVER_MENU_MIN_W - pad)),
    y: Math.max(pad, Math.min(clientY, window.innerHeight - COVER_MENU_APPROX_H - pad)),
  }
}

type Props = {
  images: string[]
  onChange: (next: string[]) => void
  /** e.g. host: h-24 w-36 border-border; admin: h-20 w-28 border-zinc-700 */
  imgClassName?: string
  removeButtonClassName?: string
}

export function TripImageGridWithCover({
  images,
  onChange,
  imgClassName = 'h-24 w-36 rounded-lg object-cover border border-border',
  removeButtonClassName = 'absolute -top-2 -right-2 z-10 bg-red-600 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity',
}: Props) {
  const imagesRef = useRef(images)
  imagesRef.current = images
  const [coverMenu, setCoverMenu] = useState<{ x: number; y: number; index: number } | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!coverMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCoverMenu(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [coverMenu])

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
      longPressCleanupRef.current?.()
    }
  }, [])

  function clearCoverLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressCleanupRef.current?.()
    longPressCleanupRef.current = null
  }

  function moveImageToCover(idx: number) {
    const prev = imagesRef.current
    if (idx <= 0 || idx >= prev.length) return
    const next = [...prev]
    const [chosen] = next.splice(idx, 1)
    onChange([chosen, ...next])
    toast.success('Cover image updated', { id: 'trip-cover-image-updated' })
  }

  function startCoverLongPress(i: number, e: React.PointerEvent) {
    if (e.button !== 0) return
    const n = imagesRef.current.length
    if (n < 2 || i === 0) return
    clearCoverLongPress()
    const onEnd = () => clearCoverLongPress()
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    longPressCleanupRef.current = () => {
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null
      longPressCleanupRef.current?.()
      longPressCleanupRef.current = null
      moveImageToCover(i)
    }, COVER_LONG_PRESS_MS)
  }

  function removeImage(idx: number) {
    onChange(imagesRef.current.filter((_, i) => i !== idx))
  }

  if (images.length === 0) return null

  return (
    <>
      {images.map((url, i) => (
        <div key={`${url}-${i}`} className="relative group">
          <div
            className="relative touch-manipulation select-none rounded-lg overflow-hidden"
            style={{ WebkitTouchCallout: 'none' }}
            onContextMenu={(e) => {
              if (images.length < 2 || i === 0) return
              e.preventDefault()
              const { x, y } = clampCoverMenuPosition(e.clientX, e.clientY)
              setCoverMenu({ x, y, index: i })
            }}
            onPointerDown={(e) => startCoverLongPress(i, e)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt=""
              draggable={false}
              className={cn(imgClassName, 'pointer-events-none')}
            />
            {i === 0 && (
              <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                Cover
              </span>
            )}
          </div>
          <button type="button" onClick={() => removeImage(i)} className={removeButtonClassName}>
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

      {coverMenu && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[100] cursor-default bg-transparent"
            aria-label="Close cover menu"
            onClick={() => setCoverMenu(null)}
          />
          <div
            role="menu"
            className="fixed z-[101] min-w-[200px] rounded-md border border-border bg-popover p-1 text-sm shadow-lg"
            style={{ left: coverMenu.x, top: coverMenu.y }}
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center rounded-sm px-3 py-2 text-left text-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                const idx = coverMenu.index
                setCoverMenu(null)
                moveImageToCover(idx)
              }}
            >
              Set as cover image
            </button>
          </div>
        </>
      )}
    </>
  )
}
