'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Globe, Lock, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { checkCanDehost, deactivateHostStatus } from '@/actions/hosting'

type Step = 'idle' | 'checking' | 'confirm' | 'blocked'

export function StopHostingPanel() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('idle')
  const [blockedReason, setBlockedReason] = useState('')
  const [keepPhonePublic, setKeepPhonePublic] = useState<boolean | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleInitiate() {
    setStep('checking')
    const result = await checkCanDehost()
    if (!result.authenticated) {
      router.push('/login')
      return
    }
    if (!result.canDehost) {
      setBlockedReason(result.reason)
      setStep('blocked')
      return
    }
    setStep('confirm')
  }

  async function handleConfirm() {
    if (keepPhonePublic === null) {
      toast.error('Please choose your phone number visibility before continuing.')
      return
    }
    setSubmitting(true)
    const result = await deactivateHostStatus(keepPhonePublic)
    setSubmitting(false)
    if (result.error) {
      toast.error(result.error)
      setStep('idle')
      return
    }
    toast.success("You've stepped down as a host. Your profile and bookings history are intact.")
    router.push('/profile')
    router.refresh()
  }

  if (step === 'idle') {
    return (
      <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-sm font-bold text-white/70 uppercase tracking-widest mb-1">Host Status</h2>
        <p className="text-sm text-white/55 mb-4">
          You can step down as a host if you have no active or upcoming bookings. Your profile, phone number, and email will remain unchanged.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
          onClick={handleInitiate}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Step down as host
        </Button>
      </div>
    )
  }

  if (step === 'checking') {
    return (
      <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <p className="text-sm text-white/60 animate-pulse">Checking for active bookings…</p>
      </div>
    )
  }

  if (step === 'blocked') {
    return (
      <div className="mt-10 rounded-xl border border-amber-400/30 bg-amber-500/10 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-300 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-amber-200">Cannot step down yet</p>
            <p className="text-sm text-white/65">{blockedReason}</p>
            <Button
              variant="outline"
              size="sm"
              className="border-white/20 text-white/70 mt-1"
              onClick={() => setStep('idle')}
            >
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // step === 'confirm'
  return (
    <div className="mt-10 rounded-xl border border-red-500/25 bg-red-500/[0.06] p-5 space-y-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-red-300">Step down as host</p>
          <p className="text-sm text-white/60 mt-1">
            Your trips and services will be deactivated. Your profile, phone number, booking history, and email stay intact.
          </p>
        </div>
      </div>

      {/* Phone visibility choice */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-white/80">What should happen to your phone number?</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setKeepPhonePublic(true)}
            className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm transition-colors ${
              keepPhonePublic === true
                ? 'border-green-500/50 bg-green-500/15 text-green-300'
                : 'border-white/15 bg-white/[0.04] text-white/60 hover:border-white/25'
            }`}
          >
            <Globe className="h-4 w-4" />
            <span className="font-medium">Keep public</span>
            <span className="text-[11px] text-center opacity-70">Anyone can see it</span>
          </button>
          <button
            type="button"
            onClick={() => setKeepPhonePublic(false)}
            className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-sm transition-colors ${
              keepPhonePublic === false
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-white/15 bg-white/[0.04] text-white/60 hover:border-white/25'
            }`}
          >
            <Lock className="h-4 w-4" />
            <span className="font-medium">Make private</span>
            <span className="text-[11px] text-center opacity-70">Request-only access</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="border-white/20 text-white/70"
          onClick={() => setStep('idle')}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="bg-red-500/80 text-white hover:bg-red-500 disabled:opacity-50"
          onClick={handleConfirm}
          disabled={submitting || keepPhonePublic === null}
        >
          {submitting ? 'Processing…' : 'Confirm — step down'}
        </Button>
      </div>
    </div>
  )
}
