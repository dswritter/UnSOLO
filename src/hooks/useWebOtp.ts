'use client'

import { useEffect } from 'react'

/**
 * Fills an SMS code automatically where the browser allows it.
 *
 * - **WebOTP** (Chrome on Android): reads the code from the incoming SMS and calls `onCode`. Chrome
 *   only hands over SMS that end with an origin line such as `@unsolo.in #1234`; our approved DLT
 *   template doesn't have that line yet, so on Android Chrome this stays silent until the template
 *   is extended (harmless until then).
 * - **iOS Safari / Chrome** suggest the code from the keyboard bar when the input has
 *   `autoComplete="one-time-code"` and `inputMode="numeric"`; that works with the current template.
 *
 * Pass `active` = true only while the code field is showing.
 */
export function useWebOtp(active: boolean, onCode: (code: string) => void, length: number) {
  useEffect(() => {
    if (!active || typeof window === 'undefined' || !('OTPCredential' in window) || !navigator.credentials) return
    const ac = new AbortController()
    navigator.credentials
      .get({ otp: { transport: ['sms'] }, signal: ac.signal } as CredentialRequestOptions & { otp: { transport: string[] } })
      .then((cred) => {
        const code = (cred as { code?: string } | null)?.code
        if (code && new RegExp(`^\\d{${length}}$`).test(code)) onCode(code)
      })
      .catch(() => { /* dismissed, aborted or unsupported */ })
    return () => ac.abort()
    // onCode is intentionally not a dependency: a new request per render would re-prompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, length])
}
