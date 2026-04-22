'use client'

import Image from 'next/image'

interface HeroBackdropProps {
  imageUrl: string | null | undefined
}

export function HeroBackdrop({ imageUrl }: HeroBackdropProps) {
  if (!imageUrl) return null

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[min(70vh,720px)] overflow-hidden"
    >
      <Image
        src={imageUrl}
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover blur-3xl scale-125 opacity-30 saturate-125"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
    </div>
  )
}
