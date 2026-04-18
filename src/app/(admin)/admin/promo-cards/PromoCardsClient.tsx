'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Plus, Trash2, Eye, EyeOff, Pencil, X } from 'lucide-react'

type Row = {
  id: string
  title: string
  body: string | null
  href: string | null
  link_label: string | null
  image_url: string | null
  variant: 'primary' | 'neutral' | 'success'
  sort_order: number
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const emptyDraft = {
  title: '',
  body: '',
  href: '',
  link_label: 'Learn more',
  image_url: '',
  variant: 'primary' as Row['variant'],
  sort_order: 0,
  starts_at: '',
  ends_at: '',
}

export default function PromoCardsClient({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initial)
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)

  function refresh() {
    const supabase = createClient()
    startTransition(async () => {
      const { data, error } = await supabase
        .from('landing_promo_cards')
        .select('*')
        .order('sort_order', { ascending: true })
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
        image_url: draft.image_url.trim() || null,
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
      setDraft({ ...emptyDraft })
      refresh()
    })
  }

  function saveEdit(row: Row, form: typeof emptyDraft) {
    if (!form.title.trim()) {
      toast.error('Title is required')
      return
    }
    const supabase = createClient()
    startTransition(async () => {
      const { error } = await supabase
        .from('landing_promo_cards')
        .update({
          title: form.title.trim(),
          body: form.body.trim() || null,
          href: form.href.trim() || null,
          link_label: form.link_label.trim() || null,
          image_url: form.image_url.trim() || null,
          variant: form.variant,
          sort_order: form.sort_order,
          starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
          ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      if (error) {
        toast.error(error.message)
        return
      }
      toast.success('Card updated')
      setEditingId(null)
      refresh()
    })
  }

  function toggleActive(row: Row) {
    const supabase = createClient()
    startTransition(async () => {
      const { error } = await supabase
        .from('landing_promo_cards')
        .update({ is_active: !row.is_active })
        .eq('id', row.id)
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
        if (editingId === row.id) setEditingId(null)
        refresh()
      }
    })
  }

  return (
    <div className="space-y-10 max-w-2xl">
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
        <h2 className="text-sm font-bold">New promo card</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Shown on the marketing home page. Signed-in users see it <strong className="text-foreground/90">above</strong> the
          chat button. Use an app path (<code className="text-[10px] bg-secondary px-1 rounded">/explore</code>) or a full
          URL (<code className="text-[10px] bg-secondary px-1 rounded">https://…</code>) — external links open in a new
          tab.
        </p>
        <Input
          placeholder="Title"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          className="bg-secondary border-border"
        />
        <Textarea
          placeholder="Subtitle / body (optional)"
          value={draft.body}
          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          className="bg-secondary border-border min-h-[72px]"
        />
        <Input
          placeholder="Image URL (optional) — https://… square or landscape thumbnail"
          value={draft.image_url}
          onChange={(e) => setDraft((d) => ({ ...d, image_url: e.target.value }))}
          className="bg-secondary border-border"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Where the button goes</label>
            <Input
              placeholder="e.g. /explore or https://example.com/offers"
              value={draft.href}
              onChange={(e) => setDraft((d) => ({ ...d, href: e.target.value }))}
              className="bg-secondary border-border"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Button label</label>
            <Input
              placeholder="Learn more"
              value={draft.link_label}
              onChange={(e) => setDraft((d) => ({ ...d, link_label: e.target.value }))}
              className="bg-secondary border-border"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <label className="text-xs text-muted-foreground">Style</label>
          <select
            value={draft.variant}
            onChange={(e) => setDraft((d) => ({ ...d, variant: e.target.value as Row['variant'] }))}
            className="h-9 rounded-lg border border-border bg-secondary px-2 text-sm"
          >
            <option value="primary">Primary (gold)</option>
            <option value="neutral">Neutral</option>
            <option value="success">Success</option>
          </select>
          <label className="text-xs text-muted-foreground ml-2">Sort order</label>
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
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id} className="rounded-lg border border-border bg-secondary/20 overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3">
                  <div className="min-w-0 flex items-start gap-2">
                    {r.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.image_url}
                        alt=""
                        className="h-10 w-10 rounded-md object-cover border border-border shrink-0"
                      />
                    ) : null}
                    <div className="min-w-0">
                      <p className="font-medium truncate">{r.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {r.is_active ? 'Active' : 'Hidden'} · order {r.sort_order} · {r.variant}
                        {r.href ? ` · → ${r.href}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant={editingId === r.id ? 'secondary' : 'outline'}
                      onClick={() => setEditingId(editingId === r.id ? null : r.id)}
                      disabled={pending}
                    >
                      {editingId === r.id ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => toggleActive(r)} disabled={pending}>
                      {r.is_active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button type="button" size="sm" variant="destructive" onClick={() => remove(r)} disabled={pending}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {editingId === r.id ? (
                  <EditCardPanel row={r} onCancel={() => setEditingId(null)} onSave={saveEdit} pending={pending} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function EditCardPanel({
  row,
  onCancel,
  onSave,
  pending,
}: {
  row: Row
  onCancel: () => void
  onSave: (row: Row, form: typeof emptyDraft) => void
  pending: boolean
}) {
  const [form, setForm] = useState({
    title: row.title,
    body: row.body || '',
    href: row.href || '',
    link_label: row.link_label || 'Learn more',
    image_url: row.image_url || '',
    variant: row.variant,
    sort_order: row.sort_order,
    starts_at: toDatetimeLocal(row.starts_at),
    ends_at: toDatetimeLocal(row.ends_at),
  })

  return (
    <div className="border-t border-border bg-card/40 p-4 space-y-3 text-sm">
      <Input
        placeholder="Title"
        value={form.title}
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        className="bg-secondary border-border"
      />
      <Textarea
        placeholder="Body (optional)"
        value={form.body}
        onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
        className="bg-secondary border-border min-h-[64px]"
      />
      <Input
        placeholder="Image URL (optional)"
        value={form.image_url}
        onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
        className="bg-secondary border-border"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input
          placeholder="Link URL or path"
          value={form.href}
          onChange={(e) => setForm((f) => ({ ...f, href: e.target.value }))}
          className="bg-secondary border-border"
        />
        <Input
          placeholder="Button label"
          value={form.link_label}
          onChange={(e) => setForm((f) => ({ ...f, link_label: e.target.value }))}
          className="bg-secondary border-border"
        />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={form.variant}
          onChange={(e) => setForm((f) => ({ ...f, variant: e.target.value as Row['variant'] }))}
          className="h-9 rounded-lg border border-border bg-secondary px-2 text-sm"
        >
          <option value="primary">Primary</option>
          <option value="neutral">Neutral</option>
          <option value="success">Success</option>
        </select>
        <Input
          type="number"
          className="w-20 h-9 bg-secondary border-border"
          value={form.sort_order}
          onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value, 10) || 0 }))}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input
          type="datetime-local"
          value={form.starts_at}
          onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
          className="bg-secondary border-border"
        />
        <Input
          type="datetime-local"
          value={form.ends_at}
          onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
          className="bg-secondary border-border"
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={() => onSave(row, form)} disabled={pending}>
          Save changes
        </Button>
      </div>
    </div>
  )
}
