'use client'

/** Web Push subscription (service worker at /sw.js) → POST /api/v1/devices { platform: 'web' }. */
export function webPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function urlB64ToUint8Array(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function enableWebPush(): Promise<'enabled' | 'denied' | 'unsupported' | 'unconfigured'> {
  if (!webPushSupported()) return 'unsupported'
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!key) return 'unconfigured'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'denied'
  const reg = await navigator.serviceWorker.register('/sw.js')
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key) }))
  await fetch('/api/v1/devices', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-unsolo-client': 'web' },
    body: JSON.stringify({ platform: 'web', token: JSON.stringify(sub.toJSON()), locale: navigator.language }),
  })
  return 'enabled'
}
