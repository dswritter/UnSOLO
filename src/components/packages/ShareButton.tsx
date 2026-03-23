'use client'

import { useState } from 'react'
import { Share2, Check, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { formatPrice } from '@/lib/utils'
import { APP_URL } from '@/lib/constants'

interface ShareButtonProps {
  slug: string
  title: string
  location: string
  pricePaise: number
  durationDays: number
  variant?: 'full' | 'icon'
}

export function ShareButton({ slug, title, location, pricePaise, durationDays, variant = 'full' }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  const url = `${APP_URL}/packages/${slug}`
  const message = `Check out this trip: ${title} - ${location} | ${formatPrice(pricePaise)}/person | ${durationDays} days\n${url}`
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `UnSOLO: ${title}`, text: message, url })
        return
      } catch { /* user cancelled, fall through to clipboard */ }
    }
    await navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success('Link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  if (variant === 'icon') {
    return (
      <div className="flex items-center gap-1">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="p-1.5 rounded-lg hover:bg-green-500/20 transition-colors"
          title="Share on WhatsApp"
        >
          <MessageCircle className="h-4 w-4 text-green-500" />
        </a>
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); handleShare() }}
          className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
          title="Share"
        >
          {copied ? <Check className="h-4 w-4 text-green-400" /> : <Share2 className="h-4 w-4 text-muted-foreground" />}
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
      >
        <MessageCircle className="h-4 w-4" />
        WhatsApp
      </a>
      <button
        onClick={handleShare}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-secondary hover:bg-secondary/80 text-sm font-medium transition-colors"
      >
        {copied ? <Check className="h-4 w-4 text-green-400" /> : <Share2 className="h-4 w-4" />}
        {copied ? 'Copied!' : 'Share'}
      </button>
    </div>
  )
}
