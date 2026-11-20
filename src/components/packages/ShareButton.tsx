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
  /** e.g. "From " when multiple price tiers */
  priceLinePrefix?: string
  /** e.g. "4 days · 3 nights" — shown in share copy */
  durationSummary: string
  variant?: 'full' | 'icon' | 'glass'
  /** Digits-only WhatsApp number (country code first). Resolved server-side
   *  in the order: per-listing override → platform default → hardcoded fallback. */
  whatsappNumber: string
}

export function ShareButton({ slug, title, location, pricePaise, priceLinePrefix = '', durationSummary, variant = 'full', whatsappNumber }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  const url = `${APP_URL}/packages/${slug}`
  const shareUrl = `${url}?share=1`
  const priceLine = `${priceLinePrefix}${formatPrice(pricePaise)}/person`
  const whatsappMessage = `Hi! May I know more about this trip?\n\n${title} - ${location} | ${priceLine} | ${durationSummary}\n${shareUrl}`
  const shareMessage = `I found this trip on UnSOLO: ${title}. Check it out: ${shareUrl}`
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`

  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `UnSOLO: ${title}`, text: shareMessage })
        return
      } catch { /* user cancelled, fall through to clipboard */ }
    }
    await navigator.clipboard.writeText(shareMessage)
    setCopied(true)
    toast.success('Share text copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  if (variant === 'glass') {
    return (
      <div className="flex items-center gap-2">
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="pc-glassbtn" aria-label="Ask on WhatsApp">
          <MessageCircle className="h-5 w-5" aria-hidden />
        </a>
        <button type="button" onClick={handleShare} className="pc-glassbtn" aria-label={copied ? 'Copied' : 'Share'}>
          {copied ? <Check className="h-5 w-5" aria-hidden /> : <Share2 className="h-5 w-5" aria-hidden />}
        </button>
      </div>
    )
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
        className="pc-btn pc-btn-sm pc-btn-quiet"
      >
        <MessageCircle className="h-4 w-4" />
        WhatsApp
      </a>
      <button
        onClick={handleShare}
        type="button"
        className="pc-btn pc-btn-sm pc-btn-quiet"
      >
        {copied ? <Check className="h-4 w-4 text-green-400" /> : <Share2 className="h-4 w-4" />}
        {copied ? 'Copied!' : 'Share'}
      </button>
    </div>
  )
}
