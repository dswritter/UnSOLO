'use client'

/**
 * "Verify your phone" as an inline step instead of an error. Anything that hits `phone_required`
 * (apiFetch does it for every /api/v1 call) awaits requestPhoneVerification(): <PhoneGateHost/>
 * opens the phone card, and the promise resolves true once the number is verified (the caller then
 * retries) or false if the person closes it. The page and anything typed stay where they were.
 */
type Listener = () => void
let open = false
let waiters: ((ok: boolean) => void)[] = []
const listeners = new Set<Listener>()
const emit = () => listeners.forEach((l) => l())

export function requestPhoneVerification(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  return new Promise((resolve) => {
    waiters.push(resolve)
    if (!open) { open = true; emit() }
  })
}

export function settlePhoneGate(ok: boolean) {
  const w = waiters
  waiters = []
  open = false
  emit()
  w.forEach((r) => r(ok))
}

export const phoneGate = {
  subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l) } },
  isOpen: () => open,
  /** Whether a host is mounted to show the card (otherwise callers fall back to an error). */
  hasHost: () => listeners.size > 0,
}
