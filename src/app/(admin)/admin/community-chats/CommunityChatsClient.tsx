'use client'

import { useState, useRef } from 'react'
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
import { Trash2, Plus, Pencil, Power, PowerOff, Upload } from 'lucide-react'

async function uploadCommunityRoomCover(file: File): Promise<string | null> {
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

  async function saveRoom(room: CommunityChatRoomRow, patch: Partial<{ name: string; description: string | null; image_url: string | null; is_active: boolean }>) {
    setBusyId(room.id)
    const r = await updateCommunityChatRoomAdmin(room.id, patch)
    setBusyId(null)
    if (r.error) {
      toast.error(r.error)
      return
    }
    toast.success('Saved')
    setRooms(prev => prev.map(x => (x.id === room.id ? { ...x, ...patch } : x)))
    router.refresh()
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
          <Input placeholder="Room name *" value={newName} onChange={e => setNewName(e.target.value)} />
          <Textarea placeholder="Description (optional)" value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={2} />
          <div className="flex flex-wrap items-center gap-2">
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
            <Button type="button" variant="outline" size="sm" disabled={busyId === 'new'} onClick={() => createFileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5 mr-1" /> Upload list image
            </Button>
            {newImageUrl && <span className="text-xs text-muted-foreground truncate max-w-[200px]">Image set</span>}
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
  onSave: (room: CommunityChatRoomRow, patch: Partial<{ name: string; description: string | null; image_url: string | null; is_active: boolean }>) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(room.name)
  const [description, setDescription] = useState(room.description || '')
  const [imageUrl, setImageUrl] = useState(room.image_url || '')
  const [editing, setEditing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className={`rounded-xl border p-4 ${room.is_active ? 'border-border bg-card' : 'border-zinc-700 bg-secondary/20 opacity-80'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3 min-w-0">
          {room.image_url ? (
            <img src={room.image_url} alt="" className="h-14 w-14 rounded-full object-cover border border-border shrink-0" />
          ) : (
            <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center text-xl shrink-0">💬</div>
          )}
          <div className="min-w-0">
            {editing ? (
              <div className="space-y-2 max-w-md">
                <Input value={name} onChange={e => setName(e.target.value)} className="font-semibold" />
                <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Description" />
                <div className="flex flex-wrap items-center gap-2">
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
                  <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5 mr-1" /> New list image
                  </Button>
                  {imageUrl ? (
                    <button type="button" className="text-xs text-muted-foreground hover:text-foreground underline" onClick={() => setImageUrl('')}>
                      Remove image
                    </button>
                  ) : null}
                </div>
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
                onClick={() => {
                  onSave(room, {
                    name,
                    description: description.trim() || null,
                    image_url: imageUrl.trim() || null,
                  })
                  setEditing(false)
                }}
              >
                Save
              </Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => { setName(room.name); setDescription(room.description || ''); setImageUrl(room.image_url || ''); setEditing(false) }}>
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
                onClick={() => onSave(room, { is_active: !room.is_active })}
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
  )
}
