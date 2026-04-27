'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import type { CommunityChatRoomRow } from '@/actions/admin'
import {
  createCommunityChatRoomAdmin,
  updateCommunityChatRoomAdmin,
  deleteCommunityChatRoomAdmin,
} from '@/actions/admin'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Trash2, Plus, Pencil, Power, PowerOff, ImageIcon, X, Maximize2 } from 'lucide-react'
import { UPLOAD_MAX_IMAGE_BYTES, UPLOAD_IMAGE_TOO_LARGE_MESSAGE } from '@/lib/constants'

async function uploadCommunityRoomCover(file: File): Promise<string | null> {
  if (file.size > UPLOAD_MAX_IMAGE_BYTES) {
    toast.error(UPLOAD_IMAGE_TOO_LARGE_MESSAGE)
    return null
  }
  const fd = new FormData()
  fd.append('file', file)
  fd.append('purpose', 'community_room')
  const res = await fetch('/api/upload', { method: 'POST', body: fd })
  const j = (await res.json()) as { url?: string; error?: string }
  if (!res.ok) {
    toast.error(j.error || 'Upload failed')
    return null
  }
  return j.url ?? null
}

export function CommunityChatsClient({ initialRooms }: { initialRooms: CommunityChatRoomRow[] }) {
  const router = useRouter()
  const [rooms, setRooms] = useState(initialRooms)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newImageUrl, setNewImageUrl] = useState<string | null>(null)
  const createFileRef = useRef<HTMLInputElement>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    setRooms(initialRooms)
  }, [initialRooms])

  async function handleCreate() {
    if (!newName.trim()) {
      toast.error('Name is required')
      return
    }
    setBusyId('new')
    const r = await createCommunityChatRoomAdmin({
      name: newName,
      description: newDesc || null,
      image_url: newImageUrl,
    })
    setBusyId(null)
    if (r.error) {
      toast.error(r.error)
      return
    }
    toast.success('Community room created')
    setNewName('')
    setNewDesc('')
    setNewImageUrl(null)
    setCreating(false)
    if (r.id) {
      setRooms(prev => [
        ...prev,
        {
          id: r.id,
          name: newName.trim(),
          type: 'general',
          description: newDesc.trim() || null,
          image_url: newImageUrl,
          is_active: true,
          created_at: new Date().toISOString(),
          package_id: null,
        },
      ])
    }
    router.refresh()
  }

  async function saveRoom(
    room: CommunityChatRoomRow,
    patch: Partial<{ name: string; description: string | null; image_url: string | null; is_active: boolean }>,
  ): Promise<boolean> {
    setBusyId(room.id)
    const r = await updateCommunityChatRoomAdmin(room.id, patch)
    setBusyId(null)
    if (r.error) {
      toast.error(r.error)
      return false
    }
    toast.success('Saved')
    setRooms(prev => prev.map(x => (x.id === room.id ? { ...x, ...patch } : x)))
    router.refresh()
    return true
  }

  async function removeRoom(room: CommunityChatRoomRow) {
    if (!window.confirm(`Permanently delete “${room.name}” and all its messages? This cannot be undone.`)) return
    setBusyId(room.id)
    const r = await deleteCommunityChatRoomAdmin(room.id)
    setBusyId(null)
    if (r.error) {
      toast.error(r.error)
      return
    }
    toast.success('Room deleted')
    setRooms(prev => prev.filter(x => x.id !== room.id))
    router.refresh()
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground max-w-xl">
          Manage public community chat rooms (sidebar list). Disable a room to hide it from new joins; delete is permanent (admin only).
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => setCreating(c => !c)} className="shrink-0">
          <Plus className="h-4 w-4 mr-1" /> New room
        </Button>
      </div>

      {creating && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3 max-w-lg">
          <p className="text-sm font-semibold">Create community room</p>
          <div className="flex gap-3 items-start">
            <input
              ref={createFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="sr-only"
              onChange={async e => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                const url = await uploadCommunityRoomCover(f)
                if (url) setNewImageUrl(url)
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    disabled={busyId === 'new'}
                    className="h-14 w-14 rounded-full border border-border bg-secondary flex items-center justify-center shrink-0 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                  >
                    {newImageUrl ? (
                      <img src={newImageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xl">💬</span>
                    )}
                  </button>
                }
              />
              <DropdownMenuContent align="start" className="min-w-[10rem] bg-card border-border">
                <DropdownMenuItem
                  onClick={() => createFileRef.current?.click()}
                  className="cursor-pointer"
                >
                  <ImageIcon className="h-4 w-4" /> Upload image
                </DropdownMenuItem>
                {newImageUrl ? (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setNewImageUrl(null)}
                    className="cursor-pointer"
                  >
                    Remove image
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex-1 space-y-2 min-w-0">
              <Input placeholder="Room name *" value={newName} onChange={e => setNewName(e.target.value)} />
              <Textarea placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={busyId === 'new'} onClick={() => void handleCreate()}>Create</Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {rooms.map(room => (
          <RoomEditor
            key={room.id}
            room={room}
            busy={busyId === room.id}
            onSave={saveRoom}
            onDelete={() => void removeRoom(room)}
          />
        ))}
        {rooms.length === 0 && !creating && (
          <p className="text-sm text-muted-foreground">No general chat rooms yet. Create one above.</p>
        )}
      </div>
    </div>
  )
}

function RoomEditor({
  room,
  busy,
  onSave,
  onDelete,
}: {
  room: CommunityChatRoomRow
  busy: boolean
  onSave: (
    room: CommunityChatRoomRow,
    patch: Partial<{ name: string; description: string | null; image_url: string | null; is_active: boolean }>,
  ) => Promise<boolean>
  onDelete: () => void
}) {
  const [name, setName] = useState(room.name)
  const [description, setDescription] = useState(room.description || '')
  const [imageUrl, setImageUrl] = useState(room.image_url || '')
  const [editing, setEditing] = useState(false)
  const [coverLightbox, setCoverLightbox] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) return
    setName(room.name)
    setDescription(room.description || '')
    setImageUrl(room.image_url || '')
  }, [room.id, room.name, room.description, room.image_url, editing])

  const previewUrl = imageUrl || room.image_url || ''

  return (
    <>
    <div className={`rounded-xl border p-4 ${room.is_active ? 'border-border bg-card' : 'border-border/80 bg-secondary/25 opacity-90'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3 min-w-0">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="sr-only"
            onChange={async e => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              const url = await uploadCommunityRoomCover(f)
              if (url) setImageUrl(url)
            }}
          />
          {editing ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    disabled={busy}
                    className="h-14 w-14 rounded-full border border-border bg-secondary flex items-center justify-center shrink-0 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                  >
                    {previewUrl ? (
                      <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xl">💬</span>
                    )}
                  </button>
                }
              />
              <DropdownMenuContent align="start" className="min-w-[10rem] bg-card border-border">
                {previewUrl ? (
                  <DropdownMenuItem onClick={() => setCoverLightbox(previewUrl)} className="cursor-pointer">
                    <Maximize2 className="h-4 w-4" /> View full size
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={() => fileRef.current?.click()} className="cursor-pointer">
                  <ImageIcon className="h-4 w-4" /> {previewUrl ? 'Replace image' : 'Upload image'}
                </DropdownMenuItem>
                {previewUrl ? (
                  <DropdownMenuItem variant="destructive" onClick={() => setImageUrl('')} className="cursor-pointer">
                    Remove image
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : previewUrl ? (
            <button
              type="button"
              onClick={() => setCoverLightbox(previewUrl)}
              className="h-14 w-14 rounded-full object-cover border border-border shrink-0 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-primary hover:ring-2 hover:ring-primary/40 transition-all"
              title="View image"
            >
              <img src={previewUrl} alt="" className="h-full w-full object-cover" />
            </button>
          ) : (
            <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center text-xl shrink-0">💬</div>
          )}
          <div className="min-w-0">
            {editing ? (
              <div className="space-y-2 max-w-md">
                <Input value={name} onChange={e => setName(e.target.value)} className="font-semibold" />
                <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Description" />
              </div>
            ) : (
              <>
                <h3 className="font-bold truncate">{room.name}</h3>
                {room.description && <p className="text-sm text-muted-foreground mt-1">{room.description}</p>}
                <p className="text-[10px] text-muted-foreground mt-1 font-mono truncate">{room.id}</p>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {editing ? (
            <>
              <Button
                size="sm"
                disabled={busy}
                onClick={async () => {
                  const ok = await onSave(room, {
                    name,
                    description: description.trim() || null,
                    image_url: imageUrl.trim() || null,
                  })
                  if (ok) setEditing(false)
                }}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={() => {
                  setName(room.name)
                  setDescription(room.description || '')
                  setImageUrl(room.image_url || '')
                  setEditing(false)
                }}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void onSave(room, { is_active: !room.is_active })}
                title={room.is_active ? 'Disable (hide from list)' : 'Re-enable'}
              >
                {room.is_active ? <><PowerOff className="h-3.5 w-3.5 mr-1" /> Disable</> : <><Power className="h-3.5 w-3.5 mr-1" /> Enable</>}
              </Button>
              <Button size="sm" variant="destructive" disabled={busy} onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
            </>
          )}
        </div>
      </div>
    </div>

      {coverLightbox ? (
        <div
          className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-6"
          onClick={() => setCoverLightbox(null)}
          role="presentation"
        >
          <button
            type="button"
            className="absolute top-4 right-4 p-2 rounded-full bg-card/90 border border-border text-muted-foreground hover:text-foreground"
            onClick={e => {
              e.stopPropagation()
              setCoverLightbox(null)
            }}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={coverLightbox}
            alt=""
            className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  )
}
