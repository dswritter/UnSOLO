'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createStatusStory } from '@/actions/statusStories'
import type { StatusStoryAudienceMode } from '@/lib/statusStories/audience'

const MODES: { value: StatusStoryAudienceMode; label: string; hint: string }[] = [
  { value: 'all', label: 'Everyone', hint: 'Visible to all signed-in viewers (optional hide list)' },
  { value: 'followers', label: 'My followers', hint: 'Only people who follow you' },
  { value: 'following', label: 'People I follow', hint: 'Only accounts you follow' },
  { value: 'users', label: 'Specific users', hint: 'List @usernames below' },
  { value: 'communities', label: 'Communities', hint: 'Members of selected community chats' },
]

export function AddStatusStorySheet({
  open,
  onOpenChange,
  generalRooms,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  generalRooms: { id: string; name: string }[]
  onCreated: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [mode, setMode] = useState<StatusStoryAudienceMode>('all')
  const [excludeUsernames, setExcludeUsernames] = useState('')
  const [includeUsernames, setIncludeUsernames] = useState('')
  const [roomIds, setRoomIds] = useState<Set<string>>(new Set())

  function reset() {
    setFile(null)
    setPreview(null)
    setMode('all')
    setExcludeUsernames('')
    setIncludeUsernames('')
    setRoomIds(new Set())
  }

  function onPickFile(f: File | null) {
    setFile(f)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(f ? URL.createObjectURL(f) : null)
  }

  if (!open) return null

  async function submit() {
    if (!file) {
      toast.error('Choose a photo')
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('purpose', 'status_story')
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const j = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !j.url) {
        toast.error(j.error || 'Upload failed')
        setBusy(false)
        return
      }
      const r = await createStatusStory({
        mediaUrl: j.url,
        mode,
        excludeUsernames: mode === 'all' ? excludeUsernames : undefined,
        includeUsernames: mode === 'users' ? includeUsernames : undefined,
        includeRoomIds: mode === 'communities' ? [...roomIds] : undefined,
      })
      if (r.error) {
        toast.error(r.error)
        setBusy(false)
        return
      }
      toast.success('Status live for 24 hours')
      reset()
      onOpenChange(false)
      onCreated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close"
        onClick={() => !busy && onOpenChange(false)}
      />
      <div
        className="relative w-full sm:max-w-md max-h-[90dvh] overflow-y-auto bg-card border border-border sm:rounded-xl shadow-2xl p-4 sm:p-5 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg">New status</h2>
          <button type="button" className="p-2 rounded-lg hover:bg-secondary" onClick={() => !busy && onOpenChange(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Photos stay up for 24 hours, then are removed automatically.</p>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Photo</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="text-sm w-full"
            disabled={busy}
            onChange={e => onPickFile(e.target.files?.[0] || null)}
          />
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="w-full max-h-48 object-contain rounded-lg border border-border" />
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Who can see this?</label>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {MODES.map(m => (
              <label key={m.value} className="flex gap-2 items-start text-sm cursor-pointer">
                <input
                  type="radio"
                  name="vis"
                  checked={mode === m.value}
                  onChange={() => setMode(m.value)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">{m.label}</span>
                  <span className="block text-[10px] text-muted-foreground">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {mode === 'all' ? (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Hide from @usernames (optional, comma-separated)</label>
            <input
              className="w-full text-sm bg-secondary border border-border rounded-lg px-3 py-2"
              value={excludeUsernames}
              onChange={e => setExcludeUsernames(e.target.value)}
              placeholder="user1, user2"
              disabled={busy}
            />
          </div>
        ) : null}

        {mode === 'users' ? (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">@usernames (comma-separated)</label>
            <input
              className="w-full text-sm bg-secondary border border-border rounded-lg px-3 py-2"
              value={includeUsernames}
              onChange={e => setIncludeUsernames(e.target.value)}
              placeholder="alex, sam"
              disabled={busy}
            />
          </div>
        ) : null}

        {mode === 'communities' ? (
          <div className="space-y-2 max-h-36 overflow-y-auto border border-border rounded-lg p-2">
            {generalRooms.length === 0 ? (
              <p className="text-xs text-muted-foreground">Join a community chat to target it here.</p>
            ) : (
              generalRooms.map(r => (
                <label key={r.id} className="flex gap-2 items-center text-sm">
                  <input
                    type="checkbox"
                    checked={roomIds.has(r.id)}
                    onChange={() => {
                      setRoomIds(prev => {
                        const n = new Set(prev)
                        if (n.has(r.id)) n.delete(r.id)
                        else n.add(r.id)
                        return n
                      })
                    }}
                  />
                  <span className="truncate">{r.name}</span>
                </label>
              ))
            )}
          </div>
        ) : null}

        <Button className="w-full bg-primary text-black font-semibold" disabled={busy} onClick={() => void submit()}>
          {busy ? 'Publishing…' : 'Publish 24h status'}
        </Button>
      </div>
    </div>
  )
}
