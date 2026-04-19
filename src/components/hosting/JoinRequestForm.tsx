'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { requestToJoin } from '@/actions/hosting'
import { createCommunityTripOrder, confirmPayment } from '@/actions/booking'
import { formatPrice } from '@/lib/utils'
import { toast } from 'sonner'
import { CheckCircle, XCircle, Clock, Send, Shield, Info, CreditCard, Tag, Gift } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getUserCredits } from '@/actions/profile'
import { validatePromoCode } from '@/actions/admin'
import { REFERRED_DISCOUNT_PAISE } from '@/lib/constants'
import { fetchCheckoutPromoList } from '@/lib/checkout-promos'
import type { JoinPreferences } from '@/types'
import Link from 'next/link'
import Script from 'next/script'

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void
      on: (event: string, handler: () => void) => void
    }
  }
}

interface ExistingRequest {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  message: string | null
  host_response: string | null
  payment_deadline: string | null
}

interface JoinRequestFormProps {
  packageId: string
  packageTitle: string
  packageSlug: string
  pricePerPersonPaise: number
  /** e.g. "From " when the package has multiple price tiers */
  priceLinePrefix?: string
  hostName: string
  joinPreferences: JoinPreferences | null
  existingRequest: ExistingRequest | null
  isHost: boolean
  isLoggedIn: boolean
}

function EligibilityIndicator({ met, label }: { met: boolean | null; label: string }) {
  if (met === null) return null
  return (
    <div className="flex items-center gap-2 text-sm">
      {met ? (
        <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
      )}
      <span className={met ? 'text-green-400' : 'text-red-400'}>{label}</span>
    </div>
  )
}

export function JoinRequestForm({
  packageId,
  packageTitle,
  packageSlug,
  pricePerPersonPaise,
  priceLinePrefix = '',
  hostName,
  joinPreferences,
  existingRequest,
  isHost,
  isLoggedIn,
}: JoinRequestFormProps) {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  /** Traveler pays the listed per-person price (platform fee is included, not added at checkout). */
  const tripPriceDisplay = `${priceLinePrefix}${formatPrice(pricePerPersonPaise)}`
  const paymentAfterApproval =
    (joinPreferences?.payment_timing ?? 'after_host_approval') === 'after_host_approval'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) {
      toast.error('Please write an intro message for the host')
      return
    }
    setLoading(true)
    try {
      const result = await requestToJoin(packageId, message.trim())
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Join request sent! The host will review your request.')
      }
    } catch {
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Not logged in
  if (!isLoggedIn) {
    return (
      <div className="space-y-4">
        <div>
          <span className="text-3xl font-black text-primary">{tripPriceDisplay}</span>
          <span className="text-muted-foreground text-sm ml-2">per person</span>
        </div>
        <p className="text-sm text-muted-foreground">Sign in to request to join this trip</p>
        <Button className="w-full bg-primary text-black font-bold hover:bg-primary/90" asChild>
          <Link href={`/login?redirectTo=/packages/${packageSlug}`}>
            Sign In to Join
          </Link>
        </Button>
      </div>
    )
  }

  // User is the host
  if (isHost) {
    return (
      <div className="space-y-4">
        <div>
          <span className="text-3xl font-black text-primary">{tripPriceDisplay}</span>
          <span className="text-muted-foreground text-sm ml-2">per person</span>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
          <Info className="h-4 w-4 text-blue-400 flex-shrink-0" />
          <span className="text-sm text-blue-400">You are the host of this trip</span>
        </div>
        <Button className="w-full font-bold" variant="outline" asChild>
          <Link href="/host">Go to Host Dashboard</Link>
        </Button>
      </div>
    )
  }

  // Existing pending request
  if (existingRequest?.status === 'pending') {
    return (
      <div className="space-y-4">
        <div>
          <span className="text-3xl font-black text-primary">{tripPriceDisplay}</span>
          <span className="text-muted-foreground text-sm ml-2">per person</span>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <Clock className="h-4 w-4 text-yellow-400 flex-shrink-0" />
          <div>
            <span className="text-sm font-medium text-yellow-400">Request Pending</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              Waiting for {hostName} to review your request
            </p>
          </div>
        </div>
        {existingRequest.message && (
          <div className="text-xs text-muted-foreground p-2 bg-secondary/50 rounded-lg">
            <span className="font-medium text-foreground">Your message:</span> {existingRequest.message}
          </div>
        )}
      </div>
    )
  }

  // Existing approved request — show payment button
  if (existingRequest?.status === 'approved') {
    return (
      <ApprovedPaymentSection
        existingRequest={existingRequest}
        tripPriceDisplay={tripPriceDisplay}
        amountPaise={pricePerPersonPaise}
        packageTitle={packageTitle}
      />
    )
  }

  // Rejected request
  if (existingRequest?.status === 'rejected') {
    return (
      <div className="space-y-4">
        <div>
          <span className="text-3xl font-black text-primary">{tripPriceDisplay}</span>
          <span className="text-muted-foreground text-sm ml-2">per person</span>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <div>
            <span className="text-sm font-medium text-red-400">Request Not Approved</span>
            {existingRequest.host_response && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {existingRequest.host_response}
              </p>
            )}
          </div>
        </div>
        <Button className="w-full" variant="outline" asChild>
          <Link href="/explore?tab=community">Browse Other Trips</Link>
        </Button>
      </div>
    )
  }

  // New request form
  const prefs = joinPreferences || {}
  const hasPrefs = !!(prefs.gender_preference || prefs.min_trips_completed)

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <span className="text-3xl font-black text-primary">{tripPriceDisplay}</span>
        <span className="text-muted-foreground text-sm ml-2">per person</span>
      </div>

      {/* Eligibility preferences */}
      {hasPrefs && (
        <div className="p-3 rounded-lg bg-secondary/50 border border-border space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Trip Preferences</h4>
          {prefs.gender_preference && prefs.gender_preference !== 'all' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4 flex-shrink-0" />
              <span>{prefs.gender_preference === 'women' ? 'Women only' : 'Men only'}</span>
            </div>
          )}
          {prefs.min_trips_completed && prefs.min_trips_completed > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4 flex-shrink-0" />
              <span>Minimum {prefs.min_trips_completed} completed trips</span>
            </div>
          )}
        </div>
      )}

      {/* Intro message */}
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">
          Tell {hostName} about yourself
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Introduce yourself, share your travel experience, and why you want to join..."
          className="w-full min-h-[100px] rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 resize-none"
          maxLength={500}
        />
        <div className="text-xs text-muted-foreground text-right mt-1">{message.length}/500</div>
      </div>

      <Button
        type="submit"
        className="w-full bg-primary text-black font-bold hover:bg-primary/90"
        disabled={loading || !message.trim()}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            Sending...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Request to Join
          </span>
        )}
      </Button>

      {paymentAfterApproval && (
        <div className="flex items-center gap-1.5 justify-center text-xs text-muted-foreground">
          <Shield className="h-3 w-3" />
          <span>Payment only after host approves your request</span>
        </div>
      )}
    </form>
  )
}

// ── Approved Payment Section ────────────────────────────────
function ApprovedPaymentSection({
  existingRequest,
  tripPriceDisplay,
  amountPaise,
  packageTitle,
}: {
  existingRequest: ExistingRequest
  tripPriceDisplay: string
  amountPaise: number
  packageTitle: string
}) {
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const router = useRouter()

  const [promoCode, setPromoCode] = useState('')
  const [promoDiscount, setPromoDiscount] = useState(0)
  const [promoName, setPromoName] = useState('')
  const [promoValidating, setPromoValidating] = useState(false)
  const [userCredits, setUserCredits] = useState(0)
  const [applyCredits, setApplyCredits] = useState(false)
  const [isReferred, setIsReferred] = useState(false)
  const [isFirstBooking, setIsFirstBooking] = useState(false)
  const [showPromoInput, setShowPromoInput] = useState(false)
  const [availablePromos, setAvailablePromos] = useState<{ code: string; name: string; discountPaise: number }[]>([])
  const [promosLoading, setPromosLoading] = useState(false)

  useEffect(() => {
    getUserCredits().then(data => {
      setUserCredits(data.credits)
      setIsReferred(data.isReferred)
      setIsFirstBooking(data.isFirstBooking)
    })
  }, [])

  useEffect(() => {
    if (!showPromoInput) return
    let cancelled = false
    setPromosLoading(true)
    const supabase = createClient()
    fetchCheckoutPromoList(supabase).then((list) => {
      if (!cancelled) {
        setAvailablePromos(list)
        setPromosLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [showPromoInput])

  async function handleValidatePromo() {
    if (!promoCode.trim()) return
    setPromoValidating(true)
    const result = await validatePromoCode(promoCode)
    if ('error' in result) {
      toast.error(result.error)
      setPromoDiscount(0)
      setPromoName('')
    } else {
      setPromoDiscount(result.discountPaise!)
      setPromoName(result.name!)
      toast.success(`Promo applied: ${result.name} — ₹${(result.discountPaise! / 100).toLocaleString('en-IN')} off!`)
    }
    setPromoValidating(false)
  }

  const referredDiscount = isReferred && isFirstBooking ? REFERRED_DISCOUNT_PAISE : 0
  const creditsToApply = applyCredits ? Math.min(userCredits, amountPaise) : 0
  const totalDiscount = promoDiscount + referredDiscount + creditsToApply
  const youPay = Math.max(0, amountPaise - promoDiscount - referredDiscount - creditsToApply)

  async function handlePayment() {
    setLoading(true)
    try {
      const result = await createCommunityTripOrder(existingRequest.id, {
        promoCode: promoDiscount > 0 ? promoCode.trim() : undefined,
        useWalletCredits: applyCredits,
      })

      if ('error' in result) {
        toast.error(result.error)
        setLoading(false)
        return
      }

      if ('instant' in result && result.instant) {
        toast.success('Booking confirmed — paid with referral credits!')
        router.push(`/book/success?booking_id=${result.bookingId}`)
        setLoading(false)
        return
      }

      const options = {
        key: result.keyId,
        amount: result.amount,
        currency: result.currency,
        name: 'UnSOLO',
        description: packageTitle || 'Community Trip',
        order_id: result.orderId,
        prefill: result.prefill,
        notes: result.notes,
        theme: { color: '#FFAA00', backdrop_color: '#000000' },
        handler: async (response: {
          razorpay_order_id: string
          razorpay_payment_id: string
          razorpay_signature: string
        }) => {
          setVerifying(true)
          const verification = await confirmPayment(
            response.razorpay_order_id,
            response.razorpay_payment_id,
            response.razorpay_signature,
          )
          if (verification.success) {
            toast.success('Payment confirmed! You\'re in!')
            router.push(`/book/success?booking_id=${verification.bookingId}`)
          } else {
            toast.error(verification.error || 'Payment verification failed')
          }
          setVerifying(false)
          setLoading(false)
        },
        modal: { ondismiss: () => setLoading(false) },
      }

      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', () => {
        toast.error('Payment failed. Please try again.')
        setLoading(false)
      })
      rzp.open()
    } catch {
      toast.error('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      {verifying && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-card border border-border rounded-xl p-8 text-center max-w-sm">
            <div className="h-12 w-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="font-bold">Confirming your booking...</p>
            <p className="text-sm text-muted-foreground mt-1">Please wait while we verify your payment</p>
          </div>
        </div>
      )}

      <div>
        <span className="text-3xl font-black text-primary">{tripPriceDisplay}</span>
        <span className="text-muted-foreground text-sm ml-2">per person</span>
      </div>

      <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
        <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />
        <div>
          <span className="text-sm font-medium text-green-400">Request Approved!</span>
          {existingRequest.payment_deadline && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Complete payment by {new Date(existingRequest.payment_deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      </div>

      {existingRequest.host_response && (
        <div className="text-xs text-muted-foreground p-2 bg-secondary/50 rounded-lg">
          <span className="font-medium text-foreground">Host message:</span> {existingRequest.host_response}
        </div>
      )}

      {/* Referral + promo (same patterns as UnSOLO package booking) */}
      <div className="space-y-2">
        {referredDiscount > 0 && (
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2 text-xs">
            <Gift className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
            <span className="text-green-400 font-medium">Referral discount: -{formatPrice(referredDiscount)}</span>
          </div>
        )}

        {userCredits > 0 && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2 cursor-pointer">
              <input
                type="checkbox"
                checked={applyCredits}
                onChange={e => setApplyCredits(e.target.checked)}
                className="accent-primary"
              />
              <span className="text-xs">
                Apply {formatPrice(Math.min(userCredits, amountPaise))} referral credits
                {userCredits >= amountPaise && (
                  <span className="text-primary ml-1">(covers full amount — no card/UPI needed)</span>
                )}
              </span>
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full border-primary/30 text-xs"
              onClick={() => setApplyCredits(true)}
            >
              Use {formatPrice(Math.min(userCredits, amountPaise))} credits in one click
            </Button>
          </div>
        )}

        {promoDiscount === 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowPromoInput(!showPromoInput)}
              className="text-xs text-primary hover:underline"
            >
              {showPromoInput ? 'Hide promo codes' : 'Have a promo code?'}
            </button>
            {showPromoInput && (
              <div className="space-y-2">
                {promosLoading ? (
                  <p className="text-[10px] text-muted-foreground">Loading UnSOLO offers…</p>
                ) : availablePromos.length > 0 ? (
                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">Tap to apply:</span>
                    {availablePromos.map(p => (
                      <button
                        key={p.code}
                        type="button"
                        onClick={() => {
                          setPromoCode(p.code)
                          setPromoDiscount(p.discountPaise)
                          setPromoName(p.name)
                          toast.success(`${p.name} applied!`)
                        }}
                        className="flex items-center justify-between w-full px-3 py-2 rounded-lg border border-border bg-secondary/30 hover:border-primary/40 transition-colors text-left"
                      >
                        <div>
                          <span className="text-xs font-medium">{p.name}</span>
                          <code className="text-[10px] text-muted-foreground ml-2 font-mono">{p.code}</code>
                        </div>
                        <span className="text-xs text-green-500 font-medium">-{formatPrice(p.discountPaise)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground">No featured codes right now — enter yours below.</p>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="Or enter code manually"
                    value={promoCode}
                    onChange={e => setPromoCode(e.target.value.toUpperCase())}
                    className="bg-secondary border-border text-xs uppercase flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleValidatePromo}
                    disabled={promoValidating || !promoCode.trim()}
                    className="border-border text-xs px-3"
                  >
                    {promoValidating ? '...' : 'Apply'}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        {promoDiscount > 0 && (
          <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2 text-xs">
            <Tag className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
            <span className="text-blue-400 font-medium">{promoName}: -{formatPrice(promoDiscount)}</span>
            <button
              type="button"
              onClick={() => { setPromoDiscount(0); setPromoCode(''); setPromoName('') }}
              className="ml-auto text-muted-foreground hover:text-foreground text-[10px]"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="bg-secondary/50 rounded-lg p-3 space-y-1 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Trip price</span>
          <span>{formatPrice(amountPaise)}</span>
        </div>
        {totalDiscount > 0 && (
          <div className="flex justify-between text-green-500 text-xs">
            <span>Discounts & credits</span>
            <span>-{formatPrice(totalDiscount)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-foreground pt-1 border-t border-border">
          <span>Due now</span>
          <span className="text-primary">{formatPrice(youPay)}</span>
        </div>
      </div>

      <Button
        onClick={handlePayment}
        disabled={loading}
        className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90"
        size="lg"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
            Processing...
          </span>
        ) : youPay <= 0 ? (
          <span className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Confirm with credits (₹0)
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Proceed to payment ({formatPrice(youPay)})
          </span>
        )}
      </Button>

      <div className="text-xs text-muted-foreground text-center">
        Secure payment via Razorpay when you pay. Referral credits apply instantly with no charge when they cover the full amount.
      </div>
    </div>
  )
}
