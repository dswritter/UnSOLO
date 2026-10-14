'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { UPLOAD_MAX_IMAGE_BYTES, UPLOAD_IMAGE_TOO_LARGE_MESSAGE } from '@/lib/constants'

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']

/** Upload one selected batch in order so the first selected photo stays first.
 * Successful files are retained even if a later file fails or is cancelled. */
export function ListingPhotoUpload({ onUploaded, onBusyChange, disabled = false }: {
  onUploaded: (urls: string[]) => void
  onBusyChange: (busy: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState('')

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; controller.current?.abort() }
  }, [])

  async function upload(files: File[]) {
    if (!files.length || controller.current || disabled) return
    const abort = new AbortController()
    controller.current = abort
    setBusy(true)
    onBusyChange(true)
    setErrors([])
    setNotice('')
    const failures: string[] = []
    let count = 0
    try {
      for (const [index, file] of files.entries()) {
        if (abort.signal.aborted) break
        setProgress(`Uploading photo ${index + 1} of ${files.length}…`)
        if (!IMAGE_TYPES.includes(file.type)) {
          failures.push(`${file.name}: Only JPEG, PNG, WebP and AVIF images are allowed.`)
          continue
        }
        if (file.size > UPLOAD_MAX_IMAGE_BYTES) {
          failures.push(`${file.name}: ${UPLOAD_IMAGE_TOO_LARGE_MESSAGE}`)
          continue
        }
        try {
          const body = new FormData()
          body.append('file', file)
          body.append('purpose', 'service_listing')
          const response = await fetch('/api/upload', { method: 'POST', body, signal: abort.signal })
          const result = await response.json()
          if (!response.ok) throw new Error(result.error || 'Upload failed. Please retry this photo.')
          if (typeof result.url !== 'string' || !/^https?:\/\//i.test(result.url)) throw new Error('The upload did not return a photo URL. Please retry.')
          if (abort.signal.aborted || !mounted.current) break
          onUploaded([result.url])
          count++
        } catch (err) {
          if (abort.signal.aborted) break
          failures.push(`${file.name}: ${err instanceof Error ? err.message : 'Upload failed. Please retry this photo.'}`)
        }
      }
    } finally {
      controller.current = null
      if (mounted.current) {
        setBusy(false)
        onBusyChange(false)
        setProgress('')
        setErrors(failures)
        setNotice(`${count} photo${count === 1 ? '' : 's'} added.${abort.signal.aborted ? ' Upload cancelled; completed photos are kept.' : ''}`)
      }
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold">
        <Upload className="h-4 w-4 text-primary" /> Select listing photos
      </label>
      <input id={id} type="file" multiple accept={IMAGE_TYPES.join(',')} disabled={disabled || busy}
        aria-describedby={`${id}-help`} className="block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground disabled:opacity-50"
        onChange={event => {
          const files = Array.from(event.currentTarget.files || [])
          event.currentTarget.value = ''
          void upload(files)
        }} />
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        Select multiple photos at once. On desktop, use Ctrl/Cmd-click or Shift-click. JPEG, PNG, WebP or AVIF, up to 5 MB each. Uploaded photos are added to your existing photos in selection order.
      </p>
      {busy && <div className="flex flex-wrap items-center gap-3">
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{progress}</p>
        <button type="button" onClick={() => controller.current?.abort()} className="text-sm font-medium text-primary hover:underline">Cancel photo uploads</button>
      </div>}
      {!busy && notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      {errors.length > 0 && <div role="alert" className="space-y-1 text-sm text-red-400">
        <p>Some photos could not be uploaded. Other photos were kept; select the failed files again to retry.</p>
        <ul className="list-disc space-y-1 break-words pl-5">{errors.map((error, index) => <li key={index}>{error}</li>)}</ul>
      </div>}
    </div>
  )
}