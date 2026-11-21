'use client'

import { useSyncExternalStore } from 'react'
import { Sheet } from '@/components/tribe/Sheet'
import { phoneGate, settlePhoneGate } from '@/lib/phone-gate'
import { PhoneVerifyForm } from './PhoneVerifyForm'

/** Mounted once at the root: the phone card any action can open with requestPhoneVerification(). */
export function PhoneGateHost() {
  const open = useSyncExternalStore(phoneGate.subscribe, phoneGate.isOpen, () => false)
  return (
    <Sheet open={open} onClose={() => settlePhoneGate(false)} title="Verify your phone to continue"
      description="We’ll text you a 4-digit code. Your number is never shown on Tribe. What you were doing stays right where it is.">
      <div className="mt-4">
        <PhoneVerifyForm autoFocus onVerified={() => settlePhoneGate(true)} />
      </div>
      <div className="fc-sheet-actions">
        <button type="button" className="pc-btn pc-btn-quiet pc-btn-block" onClick={() => settlePhoneGate(false)}>Not now</button>
      </div>
    </Sheet>
  )
}
