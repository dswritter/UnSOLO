'use client'

import { useState } from 'react'
import { Image as ImageIcon, Sparkles } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { StatusStripStory } from '@/actions/statusStories'
import { StatusStoryViewer } from '@/components/status/StatusStoryViewer'
import { X } from 'lucide-react'

export function ProfileAvatarWithStatusMenu({
  src,
  fallback,
  size = 'h-24 w-24',
  hasActiveStatus,
  statusStories,
  currentUserId,
}: {
  src: string
  fallback: string
  size?: string
  hasActiveStatus: boolean
  statusStories: StatusStripStory[]
  currentUserId: string
}) {
  const [picOpen, setPicOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)

  if (!hasActiveStatus) {
    return (
      <>
        <button type="button" onClick={() => setPicOpen(true)} className="flex-shrink-0">
          <Avatar className={`${size} border-2 border-primary/40 cursor-pointer hover:ring-4 hover:ring-primary/20 transition-all`}>
            <AvatarImage src={src} />
            <AvatarFallback className="bg-primary/20 text-primary text-2xl font-black">{fallback}</AvatarFallback>
          </Avatar>
        </button>
        {picOpen && (
          <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4" onClick={() => setPicOpen(false)}>
            <button
              type="button"
              className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
              onClick={() => setPicOpen(false)}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button type="button" className="flex-shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <Avatar className={`${size} border-2 border-primary/40 cursor-pointer hover:ring-4 hover:ring-primary/20 transition-all`}>
                <AvatarImage src={src} />
                <AvatarFallback className="bg-primary/20 text-primary text-2xl font-black">{fallback}</AvatarFallback>
              </Avatar>
            </button>
          }
        />
        <DropdownMenuContent align="start" className="min-w-[12rem] bg-card border-border z-[200]">
          <DropdownMenuItem className="cursor-pointer" onClick={() => setPicOpen(true)}>
            <ImageIcon className="h-4 w-4 mr-2" /> See profile picture
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onClick={() => setStatusOpen(true)}>
            <Sparkles className="h-4 w-4 mr-2" /> View status
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {picOpen && (
        <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4" onClick={() => setPicOpen(false)}>
          <button
            type="button"
            className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
            onClick={() => setPicOpen(false)}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="Profile"
            className="max-w-[90vw] max-h-[85vh] rounded-2xl object-contain shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {statusOpen && statusStories.length > 0 ? (
        <StatusStoryViewer
          stories={statusStories}
          initialIndex={0}
          currentUserId={currentUserId}
          onClose={() => setStatusOpen(false)}
          onDeleted={() => setStatusOpen(false)}
        />
      ) : null}
    </>
  )
}
