'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createRentalCartOrder, confirmRentalCartPayment } from '@/actions/service-listing-booking'
import { formatPrice } from '@/lib/utils'
import { validatePromoCode } from '@/actions/admin'
import { toast } from 'sonner'
import Script from 'next/script'
import { Calendar, Tag, X, ShoppingCart } from 'lucide-react'
import { getUserCredits } from '@/actions/profile'
import { fetchCheckoutPromoList } from '@/lib/checkout-promos'
import { createClient } from '@/lib/supabase/client'
import type { ServiceListing, ServiceListingItem } from '@/types'

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void
      on: (event: string, handler: () => void) => void
    }
  }
}

interface RentalCartCheckoutProps {
  listing: ServiceListing
  items: ServiceListingItem[]
  cart: Record<string, number>
}

export function RentalCartCheckout({ listing, items, cart }: RentalCartCheckoutProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const minDate = new Date().toISOString().slice(0, 10)
  const maxDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [checkInDate, setCheckInDate] = useState('')
  const [rentalDays, setRentalDays] = useState(1)
  const [applyCredits, setApplyCredits] = useState(false)
  const [userCredits, setUserCredits] = useState<number | null>(null)
  const [promoCode, setPromoCode] = useState('')
  const [promoDiscount, setPromoDiscount] = useState(0)
  const [promoName, setPromoName] = useState('')
  const [promoValidating, setPromoValidating] = useState(false)
  const [showPromoInput, setShowPromoInput] = useState(false)
  const [availablePromos, setAvailablePromos] = useState<{ code: string; name: string; discountPaise: number }[]>([])

  useEffect(() => {
    getUserCredits().then(data => setUserCredits(data.credits))
    const supabase = createClient()
    fetchCheckoutPromoList(supabase).then(p => setAvailablePromos(p))
  }, [])

  const cartEntries = Object.entries(cart).filter(([, qty]) => qty > 0)
  const cartItemDetails = cartEntries.map(([itemId, qty]) => {
    const item = items.find(i => i.id === itemId)!
    return { item, qty }
  }).filter(e => e.item)

  const grossPaise = cartItemDetails.reduce(
    (sum, { item, qty }) => sum + item.price_paise * qty * rentalDays,
    0,
  )

  const creditsUsed = applyCredits && userCredits != null && userCredits > 0
    ? Math.min(userCredits, grossPaise - promoDiscount)
    : 0

  const finalAmount = Math.max(0, grossPaise - promoDiscount - creditsUsed)

  const returnDate = (() => {
    if (!checkInDate || rentalDays < 1) return ''
    const d = new Date(checkInDate + 'T12:00:00')
    d.setDate(d.getDate() + Math.max(0, rentalDays - 1))
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  })()

  const isReady = checkInDate && cartItemDetails.length > 0

  async function handleValidatePromo() {
    if (!promoCode.trim()) return
    setPromoValidating(true)
    const res = await validatePromoCode(promoCode.trim().toUpperCase())
    setPromoValidating(false)
    if ('error' in res) { toast.error(res.error as string); return }
    if ('discountPaise' in res) {
      setPromoDiscount(res.discountPaise as number)
      setPromoName(res.name as string)
      toast.success(`${res.name} applied!`)
    }
  }

  async function handleBook() {
    if (!checkInDate) { toast.error('Pick a start date'); return }
    if (!cartItemDetails.length) { toast.error('Add items to cart'); return }
    setLoading(true)

    const res = await createRentalCartOrder(
      listing.id,
      cartItemDetails.map(({ item, qty }) => ({ itemId: item.id, quantity: qty })),
      { check_in_date: checkInDate, rental_days: rentalDays, applyCredits, promoCode: promoCode || undefined },
    )
    setLoading(false)

    if ('error' in res && res.error) { toast.error(res.error); return }
    if (!('orderId' in res)) { toast.error('Failed to create order'); return }

    if (!window.Razorpay) { toast.error('Payment not loaded'); return }

    const rzp = new window.Razorpay({
      key: res.keyId,
      amount: res.amount,
      currency: res.currency,
      order_id: res.orderId,
      name: 'UnSOLO',
      description: `${listing.title} — ${rentalDays}d rental`,
      prefill: res.prefill,
      theme: { color: '#FFC22E' },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        setVerifying(true)
        try {
          const confirm = await confirmRentalCartPayment(
            response.razorpay_order_id,
            response.razorpay_payment_id,
            response.razorpay_signature,
          )
          if ('error' in confirm && confirm.error) { toast.error(confirm.error); return }
          toast.success('Booking confirmed!')
          router.push('/bookings')
        } catch {
          toast.error('Verification failed. Please contact support.')
        } finally {
          setVerifying(false)
        }
      },
    })

    rzp.on('payment.failed', () => {
      toast.error('Payment failed. Please try again.')
      setVerifying(false)
    })
    rzp.open()
  }

  if (verifying) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <p className="text-sm text-muted-foreground">Verifying payment…</p>
      </div>
    )
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

      {/* Cart items summary */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <ShoppingCart className="h-3.5 w-3.5" /> Your cart
        </p>
        {cartItemDetails.map(({ item, qty }) => (
          <div key={item.id} className="flex justify-between items-start text-sm">
            <div>
              <span className="font-medium">{item.name}</span>
              <span className="text-muted-foreground text-xs ml-1">× {qty}</span>
            </div>
            <span className="text-muted-foreground text-xs shrink-0">
              {formatPrice(item.price_paise * qty * rentalDays)}
            </span>
          </div>
        ))}
      </div>

      {/* Start date */}
      <div className="space-y-1">
        <label className="text-sm font-medium flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-primary" /> Pick-up date
        </label>
        <Input
          type="date"
          min={minDate}
          max={maxDate}
          value={checkInDate}
          onChange={e => setCheckInDate(e.target.value)}
          className="bg-secondary border-border"
        />
      </div>

      {/* Duration */}
      <div className="space-y-1">
        <label className="text-sm font-medium">Duration</label>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-border" onClick={() => setRentalDays(d => Math.max(1, d - 1))}>-</Button>
          <span className="font-bold text-lg min-w-[2rem] text-center">{rentalDays}</span>
          <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-border" onClick={() => setRentalDays(d => d + 1)}>+</Button>
          <span className="text-sm text-muted-foreground">day{rentalDays !== 1 ? 's' : ''}</span>
        </div>
        {returnDate && (
          <p className="text-xs text-muted-foreground pt-1">
            Return by: <span className="font-semibold text-foreground">{returnDate}</span>
          </p>
        )}
      </div>

      {/* Credits — null = still loading, suppress until resolved to avoid flash */}
      {userCredits != null && userCredits > 0 && (
        <label className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2 cursor-pointer">
          <input type="checkbox" checked={applyCredits} onChange={e => setApplyCredits(e.target.checked)} className="accent-primary" />
          <span className="text-xs">Apply ₹{(userCredits / 100).toLocaleString('en-IN')} referral credits</span>
        </label>
      )}

      {/* Promo */}
      {promoDiscount === 0 && (
        <>
          <button onClick={() => setShowPromoInput(!showPromoInput)} className="text-xs text-primary hover:underline">
            {showPromoInput ? 'Hide promo codes' : 'Have a promo code?'}
          </button>
          {showPromoInput && (
            <div className="space-y-2">
              {availablePromos.length > 0 ? (
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">Tap to apply:</span>
                  {availablePromos.map(p => (
                    <button
                      key={p.code}
                      type="button"
                      onClick={() => { setPromoCode(p.code); setPromoDiscount(p.discountPaise); setPromoName(p.name); toast.success(`${p.name} applied!`) }}
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
              ) : null}
              <div className="flex gap-2">
                <Input
                  placeholder="Enter promo code"
                  value={promoCode}
                  onChange={e => setPromoCode(e.target.value.toUpperCase())}
                  className="bg-secondary border-border text-xs uppercase flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={handleValidatePromo} disabled={promoValidating || !promoCode.trim()} className="border-border text-xs px-3">
                  {promoValidating ? '...' : 'Apply'}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      {promoDiscount > 0 && (
        <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2 text-xs">
          <Tag className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <span className="text-blue-400 font-medium">{promoName}: -{formatPrice(promoDiscount)}</span>
          <button onClick={() => { setPromoDiscount(0); setPromoCode(''); setPromoName('') }} className="ml-auto text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Price breakdown */}
      <div className="bg-secondary/50 rounded-lg p-3 space-y-1 text-sm">
        {cartItemDetails.map(({ item, qty }) => (
          <div key={item.id} className="flex justify-between text-muted-foreground text-xs">
            <span>{item.name} × {qty} × {rentalDays}d</span>
            <span>{formatPrice(item.price_paise * qty * rentalDays)}</span>
          </div>
        ))}
        {promoDiscount > 0 && (
          <div className="flex justify-between text-green-500 text-xs">
            <span>Promo</span>
            <span>-{formatPrice(promoDiscount)}</span>
          </div>
        )}
        {creditsUsed > 0 && (
          <div className="flex justify-between text-green-500 text-xs">
            <span>Credits</span>
            <span>-{formatPrice(creditsUsed)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-foreground pt-1 border-t border-border">
          <span>Total</span>
          <span className="text-primary">{formatPrice(finalAmount)}</span>
        </div>
      </div>

      <Button
        onClick={handleBook}
        disabled={loading || !isReady}
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-base py-3"
      >
        {loading ? 'Creating order…' : 'Book Now'}
      </Button>
    </>
  )
}
