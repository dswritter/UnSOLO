'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Settings, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import type { RefundTier } from '@/lib/refund-tiers'
import {
  parseRefundTiersJson,
  serializeRefundTiersJson,
} from '@/lib/refund-tiers'

type Props = {
  value: string
  onChange: (json: string) => void
  defaults: RefundTier[]
  title: string
  description?: string | null
}

function emptyTier(): RefundTier {
  return { minDaysBefore: 0, maxDaysBefore: undefined, percent: 0, label: '' }
}

export function RefundTiersEditor({ value, onChange, defaults, title, description }: Props) {
  const [tiers, setTiers] = useState<RefundTier[]>(() => parseRefundTiersJson(value, defaults))

  const commit = useCallback(
    (next: RefundTier[]) => {
      setTiers(next)
      onChange(serializeRefundTiersJson(next))
    },
    [onChange]
  )

  const updateRow = (index: number, patch: Partial<RefundTier>) => {
    const next = tiers.map((row, i) => (i === index ? { ...row, ...patch } : row))
    commit(next)
  }

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= tiers.length) return
    const next = [...tiers]
    ;[next[index], next[j]] = [next[j], next[index]]
    commit(next)
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4 max-w-3xl">
      <div className="flex items-start gap-2">
        <Settings className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-semibold">{title}</div>
          {description ? (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
          ) : null}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Each row is a band of <strong className="text-foreground/80">days before departure</strong>. Leave{' '}
        <strong className="text-foreground/80">Max days</strong> empty for an open-ended band (e.g. “30+ days”). Rows
        appear on the public refund policy page in this order — use arrows to reorder.
      </p>

      <div className="space-y-3">
        {tiers.map((tier, index) => (
          <div
            key={index}
            className="rounded-lg border border-border bg-secondary/30 p-3 sm:p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-primary">Tier {index + 1}</span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label="Move tier up"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={index === tiers.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label="Move tier down"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  disabled={tiers.length <= 1}
                  onClick={() => commit(tiers.filter((_, i) => i !== index))}
                  aria-label="Remove tier"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Min days
                </label>
                <Input
                  type="number"
                  min={0}
                  value={Number.isFinite(tier.minDaysBefore) ? tier.minDaysBefore : ''}
                  onChange={(e) => {
                    const v = e.target.value === '' ? NaN : Number(e.target.value)
                    updateRow(index, { minDaysBefore: Number.isFinite(v) ? v : 0 })
                  }}
                  className="bg-background border-border h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Max days <span className="normal-case opacity-70">(optional)</span>
                </label>
                <Input
                  type="number"
                  min={0}
                  placeholder="e.g. 29 — empty = no max"
                  value={
                    tier.maxDaysBefore != null && Number.isFinite(tier.maxDaysBefore)
                      ? tier.maxDaysBefore
                      : ''
                  }
                  onChange={(e) => {
                    const raw = e.target.value.trim()
                    if (raw === '') {
                      updateRow(index, { maxDaysBefore: undefined })
                      return
                    }
                    const v = Number(raw)
                    updateRow(index, { maxDaysBefore: Number.isFinite(v) ? v : undefined })
                  }}
                  className="bg-background border-border h-9 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Refund %
                </label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={Number.isFinite(tier.percent) ? tier.percent : ''}
                  onChange={(e) => {
                    const v = e.target.value === '' ? NaN : Number(e.target.value)
                    updateRow(index, { percent: Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0 })
                  }}
                  className="bg-background border-border h-9 text-sm"
                />
              </div>
              <div className="space-y-1 sm:col-span-2 lg:col-span-4">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                  Label <span className="normal-case opacity-70">(public policy table)</span>
                </label>
                <Input
                  type="text"
                  value={tier.label ?? ''}
                  onChange={(e) => updateRow(index, { label: e.target.value })}
                  placeholder="e.g. 15–29 days before departure"
                  className="bg-background border-border h-9 text-sm"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 border-dashed"
        onClick={() => commit([...tiers, emptyTier()])}
      >
        <Plus className="h-3.5 w-3.5" />
        Add tier
      </Button>
    </div>
  )
}
