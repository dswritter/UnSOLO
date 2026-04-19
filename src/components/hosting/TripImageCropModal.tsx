'use client'

import 'react-easy-crop/react-easy-crop.css'
import { useState, useCallback } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Button } from '@/components/ui/button'
import { getCroppedImageBlob } from '@/lib/image-crop'
import { UPLOAD_MAX_IMAGE_BYTES } from '@/lib/constants'
import { formatFileSize } from '@/lib/utils'
import { toast } from 'sonner'

/** Matches explore / package listing banner ratio */
const ASPECT = 16 / 9

type Props = {
  imageSrc: string
  originalFile: File
  onClose: () => void
  /** Called with the file to upload (cropped JPEG or original) */
  onConfirm: (file: File) => void
}

export function TripImageCropModal({ imageSrc, originalFile, onClose, onConfirm }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  function useOriginal() {
    if (originalFile.size > UPLOAD_MAX_IMAGE_BYTES) {
      toast.error(
        `This image is ${formatFileSize(originalFile.size)}. Maximum is ${formatFileSize(UPLOAD_MAX_IMAGE_BYTES)} — crop to reduce size or compress the file.`,
      )
      return
    }
    onConfirm(originalFile)
  }

  async function applyCrop() {
    if (!croppedAreaPixels) {
      toast.error('Adjust the crop area first')
      return
    }
    setBusy(true)
    try {
      let blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels)
      if (blob.size > UPLOAD_MAX_IMAGE_BYTES) {
        blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, 0.75)
      }
      if (blob.size > UPLOAD_MAX_IMAGE_BYTES) {
        blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, 0.55)
      }
      if (blob.size > UPLOAD_MAX_IMAGE_BYTES) {
        toast.error(
          `Cropped file is still ${formatFileSize(blob.size)} (max ${formatFileSize(UPLOAD_MAX_IMAGE_BYTES)}). Try zooming out or use a smaller source image.`,
        )
        return
      }
      const base =
        originalFile.name.replace(/\.[^.]+$/i, '').replace(/[^\w.-]+/g, '-') || 'trip-banner'
      const file = new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
      onConfirm(file)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not crop image')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trip-crop-title"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card p-4 shadow-xl space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="trip-crop-title" className="text-lg font-bold">
          Crop banner image
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Trip cards use a wide banner (16∶9). Frame your shot, then apply — or upload the original unchanged.
        </p>
        <div className="relative h-52 w-full rounded-lg bg-black overflow-hidden">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={ASPECT}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            objectFit="contain"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
        </div>
        <div className="flex flex-wrap gap-2 justify-end pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => useOriginal()} disabled={busy}>
            Use original
          </Button>
          <Button type="button" size="sm" className="bg-primary text-primary-foreground" onClick={() => void applyCrop()} disabled={busy}>
            {busy ? 'Working…' : 'Apply crop & continue'}
          </Button>
        </div>
      </div>
    </div>
  )
}
