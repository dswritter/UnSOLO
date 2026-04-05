'use client'

import { useState, useEffect } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { X } from 'lucide-react'

interface AvatarLightboxProps {
  src: string
  fallback: string
  size?: string
}

export function AvatarLightbox({ src, fallback, size = 'h-24 w-24' }: AvatarLightboxProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open])

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex-shrink-0">
        <Avatar className={`${size} border-2 border-primary/40 cursor-pointer hover:ring-4 hover:ring-primary/20 transition-all`}>
          <AvatarImage src={src} />
          <AvatarFallback className="bg-primary/20 text-primary text-2xl font-black">{fallback}</AvatarFallback>
        </Avatar>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <button className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
          <img
            src={src}
            alt="Profile"
            className="max-w-[90vw] max-h-[85vh] rounded-2xl object-contain shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
