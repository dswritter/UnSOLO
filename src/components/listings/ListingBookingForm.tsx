'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createServiceListingOrder, confirmServiceListingPayment } from '@/actions/service-listing-booking'
import { formatPrice, validateIndianPhone } from '@/lib/utils'
import { validatePromoCode } from '@/actions/admin'
import { toast } from 'sonner'
import Script from 'next/script'
import { Calendar, Users, Gift, Tag, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getUserCredits } from '@/actions/profile'
import { fetchCheckoutPromoList } from '@/lib/checkout-promos'
import type { ServiceListing, ServiceListingItem } from '@/types'
import { REFERRED_DISCOUNT_PAISE } from '@/lib/constants'

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void
      on: (event: string, handler: () => void) => void
    }
  }
}

interface ListingBookingFormProps {
  listing: ServiceListing
  /**
   * When the listing has child items, the parent component drives item
   * selection and passes the chosen one here. Pricing, per-booking limits,
   * and inventory all pivot to the item's values when present.
   */
  selectedItem?: ServiceListingItem | null
}

export function ListingBookingForm({ listing, selectedItem }: ListingBookingFormProps) {
  const unitPricePaise = selectedItem?.price_paise ?? listing.price_paise
  const maxPerBooking = selectedItem?.max_per_booking ?? listing.max_guests_per_booking ?? 10
  const availableQty = selectedItem?.quantity_available ?? listing.quantity_available
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)

  // Date/booking inputs
  const [checkInDate, setCheckInDate] = useState('')
  const [checkOutDate, setCheckOutDate] = useState('')
  // For activities: auto-prefill to the single upcoming date when the host
  // scheduled exactly one; otherwise stay blank until the user picks.
  const todayStr = new Date().toISOString().slice(0, 10)
  const upcomingSchedule = (listing.type === 'activities' && listing.event_schedule)
    ? listing.event_schedule.filter(e => e.date >= todayStr)
    : null
  const singleScheduledDate = upcomingSchedule && upcomingSchedule.length === 1
    ? upcomingSchedule[0].date
    : ''
  const [activityDate, setActivityDate] = useState<string>(singleScheduledDate)
  const [slotKey, setSlotKey] = useState<string>('') // "start|end"
  const [rentalStartDate, setRentalStartDate] = useState('')
  const [rentalDays, setRentalDays] = useState(1)

  const selectedScheduleEntry = upcomingSchedule?.find(e => e.date === activityDate) ?? null
  // Auto-pick the only slot if there's exactly one for the selected date.
  useEffect(() => {
    if (!selectedScheduleEntry?.slots) { if (slotKey) setSlotKey(''); return }
    if (selectedScheduleEntry.slots.length === 1) {
      const s = selectedScheduleEntry.slots[0]
      setSlotKey(`${s.start}|${s.end}`)
    } else {
      setSlotKey('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityDate])

  // Quantities
  const [quantity, setQuantity] = useState(1)

  // Discounts
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

  const router = useRouter()

  // Date constraints
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = tomorrow.toISOString().split('T')[0]
  const maxDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Load user credits and referral status
  useEffect(() => {
    getUserCredits().then(data => {
      setUserCredits(data.credits)
      setIsReferred(data.isReferred)
      setIsFirstBooking(data.isFirstBooking)
    })
  }, [])

  // Load available promos
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

  // Calculate totals
  const basePrice = unitPricePaise * quantity
  const referredDiscount = isReferred && isFirstBooking ? REFERRED_DISCOUNT_PAISE : 0
  const creditsToApply = applyCredits ? Math.min(userCredits, basePrice) : 0
  const totalDiscount = promoDiscount + referredDiscount + creditsToApply
  const finalAmount = Math.max(0, basePrice - totalDiscount)

  // Get valid date based on type
  const getSelectedDate = (): string => {
    switch (listing.type) {
      case 'stays':
        return checkInDate
      case 'activities':
        return activityDate
      case 'rentals':
        return rentalStartDate
      case 'getting_around':
        return activityDate
      default:
        return ''
    }
  }

  // Validate booking inputs
  const isValidBooking = (): boolean => {
    const selectedDate = getSelectedDate()
    if (!selectedDate) return false
    // Date-specific activities: the generic future-date rule doesn't apply —
    // the schedule itself defines valid dates (the earliest may even be today).
    if (listing.type !== 'activities' || !upcomingSchedule) {
      if (new Date(selectedDate) < new Date(minDate)) return false
    }

    if (listing.type === 'stays' && !checkOutDate) return false
    if (listing.type === 'stays' && new Date(checkOutDate) <= new Date(checkInDate)) return false

    if (listing.type === 'activities' && upcomingSchedule) {
      const entry = upcomingSchedule.find(e => e.date === selectedDate)
      if (!entry) return false
      if (entry.slots && entry.slots.length > 0 && !slotKey) return false
    }

    if (quantity < 1) return false
    if (quantity > maxPerBooking) return false
    if (availableQty != null && quantity > availableQty) return false

    return true
  }

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

  async function handleBook() {
    const selectedDate = getSelectedDate()

    if (!isValidBooking()) {
      toast.error('Please fill in all required fields correctly')
      return
    }

    setLoading(true)

    try {
      const bookingData: {
        check_in_date: string
        check_out_date?: string
        quantity: number
        applyCredits: boolean
        service_listing_item_id?: string
        promoCode?: string
        booking_slot_start?: string
        booking_slot_end?: string
      } = {
        check_in_date: listing.type === 'stays' ? checkInDate : selectedDate,
        check_out_date: listing.type === 'stays' ? checkOutDate : undefined,
        quantity,
        applyCredits,
      }

      if (listing.type === 'activities' && slotKey) {
        const [start, end] = slotKey.split('|')
        bookingData.booking_slot_start = start
        bookingData.booking_slot_end = end
      }

      if (selectedItem) {
        bookingData.service_listing_item_id = selectedItem.id
      }

      if (promoDiscount > 0 && promoCode.trim()) {
        bookingData.promoCode = promoCode.trim()
      }

      const result = await createServiceListingOrder(listing.id, bookingData)

      if ('error' in result) {
        toast.error(result.error)
        setLoading(false)
        return
      }

      // Instant booking (no Razorpay needed) - unlikely for service listings but support it
      if ('instant' in result && result.instant) {
        toast.success('Booking confirmed!')
        router.push(`/booking/${listing.type}/success?booking_id=${result.bookingId}`)
        setLoading(false)
        return
      }

      const options = {
        key: result.keyId,
        amount: result.amount,
        currency: result.currency,
        name: 'UnSOLO',
        description: listing.title,
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
          const verification = await confirmServiceListingPayment(
            response.razorpay_order_id,
            response.razorpay_payment_id,
            response.razorpay_signature,
          )
          if (verification.success) {
            toast.success('Booking confirmed!')
            router.push(`/booking/${listing.type}/success?booking_id=${verification.bookingId}`)
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

      {/* Payment verification overlay */}
      {verifying && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-4 max-w-sm mx-4 shadow-2xl">
            <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <div>
              <p className="font-bold text-lg">Confirming your booking...</p>
              <p className="text-sm text-muted-foreground mt-1">Please wait while we verify your payment. Do not close this page.</p>
            </div>
          </div>
        </div>
      )}

      {/* Type-specific date/time inputs */}
      {listing.type === 'stays' && (
        <>
          <div className="space-y-1">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" /> Check-in
            </label>
            <Input
              type="date"
              min={minDate}
              max={maxDate}
              value={checkInDate}
              onChange={(e) => setCheckInDate(e.target.value)}
              className="bg-secondary border-border"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" /> Check-out
            </label>
            <Input
              type="date"
              min={checkInDate || minDate}
              max={maxDate}
              value={checkOutDate}
              onChange={(e) => setCheckOutDate(e.target.value)}
              className="bg-secondary border-border"
            />
          </div>
        </>
      )}

      {listing.type === 'activities' && !upcomingSchedule && (
        <div className="space-y-1">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-primary" /> Activity Date
          </label>
          <Input
            type="date"
            min={minDate}
            max={maxDate}
            value={activityDate}
            onChange={(e) => setActivityDate(e.target.value)}
            className="bg-secondary border-border"
          />
        </div>
      )}

      {listing.type === 'activities' && upcomingSchedule && upcomingSchedule.length > 0 && (
        <div className="space-y-2">
          {upcomingSchedule.length > 1 && (
            <>
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-primary" /> Activity Date
              </label>
              <div className="grid grid-cols-2 gap-2">
                {upcomingSchedule.map(entry => {
                  const selected = activityDate === entry.date
                  return (
                    <button
                      key={entry.date}
                      type="button"
                      onClick={() => setActivityDate(entry.date)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium text-left border transition-colors ${
                        selected
                          ? 'bg-primary/15 border-primary text-foreground'
                          : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {new Date(entry.date).toLocaleDateString('en-IN', {
                        weekday: 'short', day: 'numeric', month: 'short',
                      })}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {selectedScheduleEntry?.slots && selectedScheduleEntry.slots.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Time slot</span>
              <div className="grid grid-cols-2 gap-2">
                {selectedScheduleEntry.slots.map(s => {
                  const k = `${s.start}|${s.end}`
                  const selected = slotKey === k
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSlotKey(k)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                        selected
                          ? 'bg-primary/15 border-primary text-foreground'
                          : 'bg-secondary border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {s.start} – {s.end}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {listing.type === 'rentals' && (
        <>
          <div className="space-y-1">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" /> Rental Start Date
            </label>
            <Input
              type="date"
              min={minDate}
              max={maxDate}
              value={rentalStartDate}
              onChange={(e) => setRentalStartDate(e.target.value)}
              className="bg-secondary border-border"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Duration (days)</label>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-border" onClick={() => setRentalDays(Math.max(1, rentalDays - 1))}>-</Button>
              <span className="font-bold text-lg min-w-[2rem] text-center">{rentalDays}</span>
              <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-border" onClick={() => setRentalDays(rentalDays + 1)}>+</Button>
            </div>
          </div>
        </>
      )}

      {listing.type === 'getting_around' && (
        <div className="space-y-1">
          <label className="text-sm font-medium flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-primary" /> Travel Date
          </label>
          <Input
            type="date"
            min={minDate}
            max={maxDate}
            value={activityDate}
            onChange={(e) => setActivityDate(e.target.value)}
            className="bg-secondary border-border"
          />
        </div>
      )}

      {/* Quantity selector */}
      <div className="space-y-1">
        <label className="text-sm font-medium flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-primary" /> {listing.type === 'stays' ? 'Rooms' : 'Quantity'}
        </label>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-border" onClick={() => setQuantity(Math.max(1, quantity - 1))}>-</Button>
          <span className="font-bold text-lg min-w-[2rem] text-center">{quantity}</span>
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-9 p-0 border-border"
            onClick={() => {
              const cap = availableQty != null ? Math.min(maxPerBooking, availableQty) : maxPerBooking
              setQuantity(Math.min(cap, quantity + 1))
            }}
          >
            +
          </Button>
        </div>
      </div>

      {/* Discounts & Promo */}
      <div className="space-y-2">
        {/* Referred user first-booking discount */}
        {referredDiscount > 0 && (
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2 text-xs">
            <Gift className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
            <span className="text-green-400 font-medium">Referral discount: -{formatPrice(referredDiscount)}</span>
          </div>
        )}

        {/* Credits */}
        {userCredits > 0 && (
          <label className="flex items-center gap-2 bg-secondary/50 rounded-lg px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={applyCredits}
              onChange={e => setApplyCredits(e.target.checked)}
              className="accent-primary"
            />
            <span className="text-xs">Apply ₹{(userCredits / 100).toLocaleString('en-IN')} referral credits</span>
          </label>
        )}

        {/* Promo code */}
        {promoDiscount === 0 && (
          <>
            <button
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
                ) : (
                  <p className="text-[10px] text-muted-foreground">No featured codes right now — enter yours below.</p>
                )}
                {/* Manual entry */}
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
            <button onClick={() => { setPromoDiscount(0); setPromoCode(''); setPromoName('') }} className="ml-auto text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Price breakdown */}
      <div className="bg-secondary/50 rounded-lg p-3 space-y-1 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>{formatPrice(unitPricePaise)} x {quantity} {listing.unit.replace('_', ' ')}</span>
          <span>{formatPrice(basePrice)}</span>
        </div>
        {totalDiscount > 0 && (
          <div className="flex justify-between text-green-500 text-xs">
            <span>Discount</span>
            <span>-{formatPrice(totalDiscount)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-foreground pt-1 border-t border-border">
          <span>Total</span>
          <span className="text-primary">{formatPrice(finalAmount)}</span>
        </div>
      </div>

      <Button
        onClick={handleBook}
        disabled={loading || !isValidBooking()}
        className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90"
        size="lg"
      >
        {loading ? 'Processing...' : 'Book Now'}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Secure payment via Razorpay. UPI, Cards, Netbanking accepted.
      </p>
    </div>
  )
}
