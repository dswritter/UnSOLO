'use client'

import type { RefObject } from 'react'
import { flushSync } from 'react-dom'
import { Bold, Heading2, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toggleBulletLine, toggleHeadingLine, wrapBold } from '@/lib/trip-description-markdown'
import { cn } from '@/lib/utils'

type Props = {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (next: string) => void
  className?: string
}

export function TripDescriptionMarkdownToolbar({ textareaRef, value, onChange, className }: Props) {
  function apply(mutate: (t: string, a: number, b: number) => { next: string; selStart: number; selEnd: number }) {
    const el = textareaRef.current
    if (!el) return
    const a = el.selectionStart
    const b = el.selectionEnd
    const { next, selStart, selEnd } = mutate(value, a, b)
    flushSync(() => {
      onChange(next)
    })
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(selStart, selEnd)
    })
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      <span className="text-[10px] text-muted-foreground mr-1 shrink-0">Format:</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 w-8 p-0"
        title="Bold (**text**)"
        onClick={() => apply((t, s, e) => wrapBold(t, s, e))}
      >
        <Bold className="h-3.5 w-3.5" />
        <span className="sr-only">Bold</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 w-8 p-0"
        title="Heading (line: ## text)"
        onClick={() =>
          apply((t, s, e) => {
            const cursor = Math.min(s, e)
            const { next, selStart, selEnd } = toggleHeadingLine(t, cursor)
            return { next, selStart, selEnd }
          })
        }
      >
        <Heading2 className="h-3.5 w-3.5" />
        <span className="sr-only">Heading</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 w-8 p-0"
        title="Bullet list (- item)"
        onClick={() =>
          apply((t, s, e) => {
            const cursor = Math.min(s, e)
            const { next, selStart, selEnd } = toggleBulletLine(t, cursor)
            return { next, selStart, selEnd }
          })
        }
      >
        <List className="h-3.5 w-3.5" />
        <span className="sr-only">Bullet list</span>
      </Button>
    </div>
  )
}
