'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

/** Play Store page for the Android app (override with NEXT_PUBLIC_ANDROID_APP_URL). */
const ANDROID_URL = process.env.NEXT_PUBLIC_ANDROID_APP_URL || 'https://play.google.com/store/apps/details?id=in.unsolo.app'
const KEY = 'unsolo.getApp.dismissedAt'
const QUIET_DAYS = 14

type Platform = 'android' | 'ios' | null

function detect(): Platform {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'android'
  // iPadOS 13+ reports as Mac; touch points give it away.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  return null
}

function standalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function recentlyDismissed() {
  try {
    const t = Number(localStorage.getItem(KEY) ?? 0)
    return Date.now() - t < QUIET_DAYS * 86_400_000
  } catch { return false }
}

/**
 * On phones: Android gets the Android app (not the web install), iPhone gets "Add to Home Screen"
 * for the web app until the iOS app is out. Hidden inside the installed app and for two weeks
 * after you close it.
 */
export function GetTheApp() {
  const [platform, setPlatform] = useState<Platform>(null)

  useEffect(() => {
    const p = detect()
    // Android: keep Chrome from offering the web app instead of the real one.
    const block = (e: Event) => { if (p === 'android') e.preventDefault() }
    window.addEventListener('beforeinstallprompt', block)
    if (p && !standalone() && !recentlyDismissed()) {
      const t = window.setTimeout(() => setPlatform(p), 2500)
      return () => { window.clearTimeout(t); window.removeEventListener('beforeinstallprompt', block) }
    }
    return () => window.removeEventListener('beforeinstallprompt', block)
  }, [])

  if (!platform) return null
  const close = () => {
    try { localStorage.setItem(KEY, String(Date.now())) } catch { /* private mode */ }
    setPlatform(null)
  }

  return (
    <div className="fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-50 md:hidden" role="dialog" aria-label="Get the UnSOLO app">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight">{platform === 'android' ? 'Get the UnSOLO app' : 'Add UnSOLO to your Home Screen'}</p>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {platform === 'android'
              ? 'Faster, with stories, trip alerts and SOS.'
              : <>Tap <span aria-label="Share" className="font-semibold">Share ⬆︎</span>, then <span className="font-semibold">Add to Home Screen</span>.</>}
          </p>
        </div>
        {platform === 'android' && (
          <a href={ANDROID_URL} onClick={close} className="shrink-0 rounded-full bg-[#FCBA12] px-4 py-2 text-sm font-bold text-black">
            Get it
          </a>
        )}
        <button type="button" onClick={close} aria-label="Close" className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
