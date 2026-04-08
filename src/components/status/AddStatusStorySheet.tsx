'use client'

import { useState, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import { X, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createStatusStories } from '@/actions/statusStories'
import type { StatusStoryAudienceMode } from '@/lib/statusStories/audience'
import { audiencePillLabel } from '@/lib/statusStories/labels'

const MODES: { value: StatusStoryAudienceMode; label: string; hint: string }[] = [
  { value: 'all', label: 'Everyone', hint: 'All signed-in members of UnSOLO' },
  { value: 'followers', label: 'My followers', hint: 'Only people who follow you' },
  { value: 'following', label: 'People I follow', hint: 'Only people you follow' },
  { value: 'users', label: 'Only share with…', hint: 'Pick specific people by @username' },
  { value: 'communities', label: 'Community members', hint: 'People in selected community chats' },
]

function countCsvParts(s: string) {
  return s.split(/[\s,]+/).map(x => x.trim().replace(/^@/, '')).filter(Boolean).length
}

export function AddStatusStorySheet({
  open,
  onOpenChange,
  generalRooms,
  existingActiveCount,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  generalRooms: { id: string; name: string }[]
  /** Non-expired status rows the user already has (max 3 total) */
  existingActiveCount: number
  onCreated: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [audienceOpen, setAudienceOpen] = useState(false)

  const [mode, setMode] = useState<StatusStoryAudienceMode>('all')
  const [excludeUsernames, setExcludeUsernames] = useState('')
  const [includeUsernames, setIncludeUsernames] = useState('')
  const [roomIds, setRoomIds] = useState<Set<string>>(new Set())

  const maxNew = Math.max(0, 3 - existingActiveCount)

  useEffect(() => {
    if (open) return
    setBusy(false)
    setFiles([])
    setPreviews(prev => {
      prev.forEach(u => URL.revokeObjectURL(u))
      return []
    })
    setAudienceOpen(false)
    setMode('all')
    setExcludeUsernames('')
    setIncludeUsernames('')
    setRoomIds(new Set())
  }, [open])

  const pillLabel = useMemo(
    () =>
      audiencePillLabel(mode, {
        excludeCount: countCsvParts(excludeUsernames),
        includeUserCount: countCsvParts(includeUsernames),
        roomCount: roomIds.size,
      }),
    [mode, excludeUsernames, includeUsernames, roomIds.size],
  )

  function onPickFileList(list: FileList | null) {
    if (!list?.length) return
    const arr = Array.from(list).filter(f => f.type.startsWith('image/'))
    if (arr.length < list.length) toast.message('Only photos are allowed')
    const take = arr.slice(0, maxNew)
    if (arr.length > maxNew) toast.message(`You can add up to ${maxNew} more (3 active total)`)
    setFiles(take)
    previews.forEach(u => URL.revokeObjectURL(u))
    setPreviews(take.map(f => URL.createObjectURL(f)))
  }

  if (!open) return null

  async function submit() {
    if (!files.length) {
      toast.error('Choose at least one photo')
      return
    }
    if (maxNew <= 0) {
      toast.error('You already have 3 active status photos')
      return
    }
    setBusy(true)
    try {
      const urls: string[] = []
      for (const file of files) {
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
        urls.push(j.url)
      }
      const r = await createStatusStories({
        mediaUrls: urls,
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
      toast.success('Shared')
      onOpenChange(false)
      onCreated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
        <button
          type="button"
          className="absolute inset-0 bg-black/70"
          aria-label="Close"
          onClick={() => !busy && onOpenChange(false)}
        />
        <div
          className="relative w-full sm:max-w-lg max-h-[92dvh] flex flex-col bg-card border border-border sm:rounded-xl shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <h2 className="font-bold text-lg">New status</h2>
            <button type="button" className="p-2 rounded-lg hover:bg-secondary" onClick={() => !busy && onOpenChange(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-y-auto flex-1 px-4 py-4 space-y-4 min-h-0">
            <p className="text-xs text-muted-foreground">Photos only · Up to 3 active at once · Removed automatically after 24 hours.</p>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Photos ({files.length}/{maxNew || 0} new)</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                multiple={maxNew > 1}
                className="text-sm w-full"
                disabled={busy || maxNew <= 0}
                onChange={e => onPickFileList(e.target.files)}
              />
              {previews.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {previews.map((u, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={u} src={u} alt="" className="h-24 w-24 shrink-0 rounded-lg object-cover border border-border" />
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="border-t border-border p-3 sm:p-4 flex flex-col sm:flex-row gap-2 shrink-0 bg-card">
            <Button
              type="button"
              variant="outline"
              className="flex-1 justify-between border-border text-sm h-11"
              disabled={busy}
              onClick={() => setAudienceOpen(true)}
            >
              <span className="truncate text-left">
                <span className="text-muted-foreground text-xs block">Audience</span>
                {pillLabel}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 opacity-60" />
            </Button>
            <Button
              className="flex-1 bg-primary text-black font-semibold h-11 min-w-[8rem]"
              disabled={busy || maxNew <= 0}
              onClick={() => void submit()}
            >
              {busy ? 'Sharing…' : 'Share'}
            </Button>
          </div>
        </div>
      </div>

      {audienceOpen ? (
        <div className="fixed inset-0 z-[120] flex flex-col bg-background sm:items-center sm:justify-center sm:p-4">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <h3 className="font-semibold">Choose audience</h3>
            <button type="button" className="p-2 rounded-lg hover:bg-secondary" onClick={() => setAudienceOpen(false)}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0 max-w-lg mx-auto w-full">
            <div className="space-y-3">
              {MODES.map(m => (
                <label key={m.value} className="flex gap-3 items-start text-sm cursor-pointer rounded-lg border border-border p-3 hover:bg-secondary/40">
                  <input
                    type="radio"
                    name="vis2"
                    checked={mode === m.value}
                    onChange={() => setMode(m.value)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium block">{m.label}</span>
                    <span className="text-[11px] text-muted-foreground">{m.hint}</span>
                  </span>
                </label>
              ))}
            </div>

            {mode === 'all' ? (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Everyone except… (@usernames, comma-separated)</label>
                <input
                  className="w-full text-sm bg-secondary border border-border rounded-lg px-3 py-2"
                  value={excludeUsernames}
                  onChange={e => setExcludeUsernames(e.target.value)}
                  placeholder="optional"
                />
              </div>
            ) : null}

            {mode === 'users' ? (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">@usernames (comma-separated)</label>
                <input
                  className="w-full text-sm bg-secondary border border-border rounded-lg px-3 py-2"
                  value={includeUsernames}
                  onChange={e => setIncludeUsernames(e.target.value)}
                  placeholder="alex, sam"
                />
              </div>
            ) : null}

            {mode === 'communities' ? (
              <div className="space-y-2 max-h-48 overflow-y-auto border border-border rounded-lg p-2">
                {generalRooms.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Join a community chat to use this option.</p>
                ) : (
                  generalRooms.map(r => (
                    <label key={r.id} className="flex gap-2 items-center text-sm py-1">
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

            <Button className="w-full bg-primary text-black font-semibold" onClick={() => setAudienceOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}
