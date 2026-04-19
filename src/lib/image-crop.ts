import type { Area } from 'react-easy-crop'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = src
  })
}

/** Crops a region (pixels on the source image) to a JPEG blob. */
export async function getCroppedImageBlob(
  imageSrc: string,
  pixelCrop: Area,
  quality = 0.9,
): Promise<Blob> {
  const image = await loadImage(imageSrc)
  const sx = Math.round(pixelCrop.x)
  const sy = Math.round(pixelCrop.y)
  const sw = Math.max(1, Math.round(pixelCrop.width))
  const sh = Math.max(1, Math.round(pixelCrop.height))
  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get canvas context')
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not create image'))),
      'image/jpeg',
      quality,
    )
  })
}
