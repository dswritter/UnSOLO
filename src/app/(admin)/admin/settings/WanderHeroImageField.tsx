'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { UPLOAD_MAX_IMAGE_BYTES, UPLOAD_IMAGE_TOO_LARGE_MESSAGE } from '@/lib/constants'
import { ImagePlus, X } from 'lucide-react'

type Props = {
  value: string
  onChange: (v: string) => void
  className?: string
}

/**
 * URL field + local file upload to public storage (admin /api/upload purpose wander_hero).
 * Clearing the URL (Use default) restores the built-in hero image on /wander.
 */
export function WanderHeroImageField({ value, onChange, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function onPickFile(f: File | null) {
    setErr(null)
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setErr('Choose a JPEG, PNG, WebP, or AVIF image.')
      return
    }
    if (f.size > UPLOAD_MAX_IMAGE_BYTES) {
      setErr(UPLOAD_IMAGE_TOO_LARGE_MESSAGE)
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      fd.append('purpose', 'wander_hero')
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const json = (await res.json()) as { url?: string; error?: string }
      if (json.url) onChange(json.url)
      else setErr(json.error || 'Upload failed')
    } catch {
      setErr('Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className={cn('flex w-full min-w-0 max-w-xl flex-col gap-2', className)}>
      <Input
        type="url"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="https://…"
        className="bg-secondary border-border h-9 w-full"
        autoComplete="off"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="hidden"
          onChange={e => onPickFile(e.target.files?.[0] || null)}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={uploading}
          className="gap-1.5"
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="h-4 w-4" />
          {uploading ? 'Uploading…' : 'Upload from device'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground"
          onClick={() => onChange('')}
        >
          <X className="h-4 w-4" />
          Use default image
        </Button>
        <span className="text-[11px] text-muted-foreground">Max 5MB · URL or upload</span>
      </div>
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
    </div>
  )
}
