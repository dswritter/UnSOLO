'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { apiFetch } from '@/lib/api/client'
import { track, trackScreen } from '@/lib/analytics/client'

type Tab = 'explore' | 'tribe' | 'trips'
const LABEL: Record<Tab, string> = { explore: 'Explore', tribe: 'Tribe', trips: 'My trips' }

/**
 * Records a tab visit; for signed-in users, asks the API whether this tab is used most and, if so,
 * offers to make it the start page ("open the app on Tribe"). Shown at most once per session.
 */
export function LandingPrompt({ tab, signedIn }: { tab: Tab; signedIn: boolean }) {
  const [suggest, setSuggest] = useState<Tab | null>(null)
  useEffect(() => {
    trackScreen(tab)
    if (!signedIn) return
    try { if (sessionStorage.getItem('unsolo.landingAsked')) return } catch { /* ignore */ }
    const t = setTimeout(async () => {
      try {
        const r = await apiFetch<{ suggest: Tab | null }>('/me/landing-suggestion')
        if (r.suggest === tab) {
          setSuggest(r.suggest)
          track('landing.prompt_shown', { tab })
          try { sessionStorage.setItem('unsolo.landingAsked', '1') } catch { /* ignore */ }
        }
      } catch { /* not critical */ }
    }, 1500)
    return () => clearTimeout(t)
  }, [tab, signedIn])

  if (!suggest) return null
  async function accept() {
    setSuggest(null)
    track('landing.prompt_accepted', { tab: suggest })
    try {
      await apiFetch('/me/preferences', { method: 'PUT', body: { landingTab: suggest } })
      localStorage.setItem('unsolo.landingTab', suggest!)
    } catch { /* ignore */ }
  }
  async function dismiss() {
    setSuggest(null)
    try { await apiFetch('/me/landing-suggestion/dismiss', { method: 'POST' }) } catch { /* ignore */ }
  }
  return (
    <div role="dialog" aria-label="Start page" className="pc-card fixed inset-x-3 bottom-[calc(var(--pc-tab-bar)+16px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md p-4 shadow-[0_10px_30px_rgba(17,17,17,0.18)] md:bottom-6">
      <button type="button" onClick={dismiss} className="pc-iconbtn absolute right-1 top-1" aria-label="Not now"><X className="h-4 w-4" /></button>
      <p className="pr-8 font-bold">You open {LABEL[suggest]} the most.</p>
      <p className="mt-1 text-sm text-muted-foreground">Start UnSOLO on {LABEL[suggest]} every time you open it? You can change this in Settings.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" className="pc-btn pc-btn-sm" onClick={accept}>Start on {LABEL[suggest]}</button>
        <button type="button" className="pc-btn pc-btn-quiet pc-btn-sm" onClick={dismiss}>Not now</button>
      </div>
    </div>
  )
}
