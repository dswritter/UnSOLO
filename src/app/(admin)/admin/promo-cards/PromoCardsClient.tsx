'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Plus, Trash2, Eye, EyeOff } from 'lucide-react'

type Row = {
  id: string
  title: string
  body: string | null
  href: string | null
  link_label: string | null
  variant: 'primary' | 'neutral' | 'success'
  sort_order: number
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
}

export default function PromoCardsClient({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial)
  const [pending, startTransition] = useTransition()

  const [draft, setDraft] = useState({
    title: '',
    body: '',
    href: '',
    link_label: 'Learn more',
    variant: 'primary' as Row['variant'],
    sort_order: 0,
    starts_at: '',
    ends_at: '',
  })

  function refresh() {
    const supabase = createClient()
    startTransition(async () => {
      const { data, error } = await supabase.from('landing_promo_cards').select('*').order('sort_order', { ascending: true })
      if (error) {
        toast.error(error.message)
        return
      }
      setRows((data || []) as Row[])
    })
  }

  function addCard() {
    if (!draft.title.trim()) {
      toast.error('Title is required')
      return
    }
    const supabase = createClient()
    startTransition(async () => {
      const { error } = await supabase.from('landing_promo_cards').insert({
        title: draft.title.trim(),
        body: draft.body.trim() || null,
        href: draft.href.trim() || null,
        link_label: draft.link_label.trim() || null,
        variant: draft.variant,
        sort_order: draft.sort_order,
        is_active: true,
        starts_at: draft.starts_at ? new Date(draft.starts_at).toISOString() : null,
        ends_at: draft.ends_at ? new Date(draft.ends_at).toISOString() : null,
      })
      if (error) {
        toast.error(error.message)
        return
      }
      toast.success('Card created')
      setDraft({
        title: '',
        body: '',
        href: '',
        link_label: 'Learn more',
        variant: 'primary',
        sort_order: 0,
        starts_at: '',
        ends_at: '',
      })
      refresh()
    })
  }

  function toggleActive(row: Row) {
    const supabase = createClient()
    startTransition(async () => {
      const { error } = await supabase.from('landing_promo_cards').update({ is_active: !row.is_active }).eq('id', row.id)
      if (error) toast.error(error.message)
      else {
        toast.success(row.is_active ? 'Hidden from home' : 'Live on home')
        refresh()
      }
    })
  }

  function remove(row: Row) {
    if (!confirm(`Delete “${row.title}”?`)) return
    const supabase = createClient()
    startTransition(async () => {
      const { error } = await supabase.from('landing_promo_cards').delete().eq('id', row.id)
      if (error) toast.error(error.message)
      else {
        toast.success('Deleted')
        refresh()
      }
    })
  }

  return (
    <div className="space-y-10 max-w-2xl">
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
        <h2 className="text-sm font-bold">New floating card</h2>
        <p className="text-xs text-muted-foreground">
          Shown on the marketing home page (bottom-right on desktop). Users can dismiss per card; optional start/end times.
 </p>
        <Input
          placeholder="Title"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          className="bg-secondary border-border"
        />
        <Textarea
          placeholder="Body (optional)"
          value={draft.body}
          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          className="bg-secondary border-border min-h-[72px]"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input
            placeholder="Link path or URL (e.g. /community)"
            value={draft.href}
            onChange={(e) => setDraft((d) => ({ ...d, href: e.target.value }))}
            className="bg-secondary border-border"
          />
          <Input
            placeholder="Link label"
            value={draft.link_label}
            onChange={(e) => setDraft((d) => ({ ...d, link_label: e.target.value }))}
            className="bg-secondary border-border"
          />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-xs text-muted-foreground">Variant</label>
          <select
            value={draft.variant}
            onChange={(e) => setDraft((d) => ({ ...d, variant: e.target.value as Row['variant'] }))}
            className="h-9 rounded-lg border border-border bg-secondary px-2 text-sm"
          >
            <option value="primary">Primary (gold)</option>
            <option value="neutral">Neutral</option>
            <option value="success">Success</option>
          </select>
          <label className="text-xs text-muted-foreground ml-2">Sort</label>
          <Input
            type="number"
            className="w-20 h-9 bg-secondary border-border"
            value={draft.sort_order}
            onChange={(e) => setDraft((d) => ({ ...d, sort_order: parseInt(e.target.value, 10) || 0 }))}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground">Starts at (optional, local)</label>
            <Input
              type="datetime-local"
              value={draft.starts_at}
              onChange={(e) => setDraft((d) => ({ ...d, starts_at: e.target.value }))}
              className="bg-secondary border-border"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">Ends at (optional)</label>
            <Input
              type="datetime-local"
              value={draft.ends_at}
              onChange={(e) => setDraft((d) => ({ ...d, ends_at: e.target.value }))}
              className="bg-secondary border-border"
            />
          </div>
        </div>
        <Button type="button" onClick={addCard} disabled={pending} className="gap-2 bg-primary text-primary-foreground">
          <Plus className="h-4 w-4" />
          Add card
        </Button>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-bold">Existing cards</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cards yet.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-border bg-secondary/20 p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{r.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {r.is_active ? 'Active' : 'Hidden'} · order {r.sort_order} · {r.variant}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button type="button" size="sm" variant="outline" onClick={() => toggleActive(r)} disabled={pending}>
                    {r.is_active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                  <Button type="button" size="sm" variant="destructive" onClick={() => remove(r)} disabled={pending}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
