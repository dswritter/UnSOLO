'use client'

import { UPLOAD_CLIENT_MAX_BYTES, UPLOAD_CLIENT_MAX_EDGE } from './limits'

export type CompressedImage = { blob: Blob; width: number; height: number; previewUrl: string }

/**
 * Browser-side compression before upload (hosts, stories, posts): decode (EXIF-orientation aware),
 * scale the long edge to ≤ 2048 px, re-encode WebP (JPEG fallback) lowering quality, then size,
 * until ≤ 2 MB. Metadata (incl. GPS) is dropped by the canvas re-encode.
 */
export async function compressImage(file: File, maxBytes = UPLOAD_CLIENT_MAX_BYTES, maxEdge = UPLOAD_CLIENT_MAX_EDGE): Promise<CompressedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(async () => {
    // Safari < 17 fallback
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return await createImageBitmap(img)
    } finally {
      URL.revokeObjectURL(url)
    }
  })
  let edge = Math.min(maxEdge, Math.max(bitmap.width, bitmap.height))
  const type = supportsWebp() ? 'image/webp' : 'image/jpeg'
  for (let attempt = 0; attempt < 8; attempt++) {
    const scale = edge / Math.max(bitmap.width, bitmap.height)
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h })
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (!ctx) throw new Error('Could not process this photo')
    ctx.drawImage(bitmap, 0, 0, w, h)
    for (const q of [0.86, 0.78, 0.7, 0.6]) {
      const blob = await toBlob(canvas, type, q)
      if (blob.size <= maxBytes) {
        bitmap.close?.()
        return { blob, width: w, height: h, previewUrl: URL.createObjectURL(blob) }
      }
    }
    edge = Math.round(edge * 0.8)
  }
  bitmap.close?.()
  throw new Error('This photo is too large even after compression')
}

function toBlob(canvas: HTMLCanvasElement | OffscreenCanvas, type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality })
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), type, quality))
}

let webp: boolean | null = null
function supportsWebp() {
  if (webp !== null) return webp
  try {
    webp = document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    webp = false
  }
  return webp
}

/** Upload with progress (XHR) to /api/v1/uploads. Runs in the background while the UI shows the local preview. */
export function uploadImage(blob: Blob, purpose: 'post' | 'story' | 'avatar' | 'host', onProgress?: (p: number) => void, signal?: AbortSignal) {
  return new Promise<{ url: string; thumbUrl: string; lqip: string; width: number | null; height: number | null; bytes: number }>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/v1/uploads')
    xhr.setRequestHeader('x-unsolo-client', 'web')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) resolve(data)
        else reject(new Error(data?.error?.message ?? 'Upload failed'))
      } catch {
        reject(new Error('Upload failed'))
      }
    }
    xhr.onerror = () => reject(new Error('You seem to be offline. We’ll keep the photo here.'))
    signal?.addEventListener('abort', () => xhr.abort())
    const form = new FormData()
    form.append('file', blob, blob.type === 'image/webp' ? 'photo.webp' : 'photo.jpg')
    form.append('purpose', purpose)
    xhr.send(form)
  })
}
