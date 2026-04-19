'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createRazorpayOrder, confirmPayment, submitCustomDateRequest } from '@/actions/booking'
import { createGroupBooking } from '@/actions/group-booking'
import { formatPrice, formatDate, validateIndianPhone, getMaxDate } from '@/lib/utils'
import {
  formatDateRangeFromEdges,
  tripEndDateIsoForBooking,
  type TripPackageCalendar,
} from '@/lib/package-trip-calendar'
import { parsePriceVariants } from '@/lib/package-pricing'
import { toast } from 'sonner'
import Script from 'next/script'
import { Calendar, Phone, Mail, Users, Send, Copy, Check, X, UserPlus, Gift, Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getUserCredits } from '@/actions/profile'
import { validatePromoCode } from '@/actions/admin'
import { REFERRED_DISCOUNT_PAISE } from '@/lib/constants'
import { fetchCheckoutPromoList } from '@/lib/checkout-promos'

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void
      on: (event: string, handler: () => void) => void
    }
  }
}

interface GroupInvite {
  id: string
  travel_date: string
  organizer_name: string
  per_person_paise: number
}

interface BookingFormClientProps {
  packageId: string
  packageSlug: string
  pricePerPersonPaise: number
  priceVariants?: { description: string; price_paise: number }[] | null
  maxGroupSize: number
  packageTitle?: string
  departureDates?: string[] | null
  returnDates?: string[] | null
  durationDays?: number
  groupInvite?: GroupInvite | null
  availableSlots?: Record<string, number>
  /** Community trips with payment_timing token_to_book */
  tokenBooking?: { tokenAmountPaisePerPerson: number } | null
}

export function BookingFormClient({
  packageId,
  packageSlug,
  pricePerPersonPaise,
  priceVariants = null,
  maxGroupSize,
  packageTitle,
  departureDates,
  returnDates,
  durationDays,
  groupInvite,
  availableSlots = {},
  tokenBooking = null,
}: BookingFormClientProps) {
  const pkgCal: TripPackageCalendar = {
    duration_days: Math.max(1, durationDays || 1),
    departure_dates: departureDates,
    return_dates: returnDates,
  }

  const variantTiers = parsePriceVariants(priceVariants)

  function travelRangeLabel(depIso: string): string {
    const end = tripEndDateIsoForBooking(depIso, pkgCal)
    return formatDateRangeFromEdges(depIso, end)
  }

  const [tab, setTab] = useState<'fixed' | 'custom' | 'group'>(groupInvite ? 'fixed' : 'fixed')
  const [guests, setGuests] = useState(1)
  const [selectedDate, setSelectedDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)

  // Discount state
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

  // Group booking state
  const [groupDate, setGroupDate] = useState('')
  const [groupLoading, setGroupLoading] = useState(false)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const [groupPayMode, setGroupPayMode] = useState<'full' | 'split'>('split')
  // Add friends by username
  const [friendUsername, setFriendUsername] = useState('')
  const [friendSearching, setFriendSearching] = useState(false)
  const [addedFriends, setAddedFriends] = useState<{ id: string; username: string; full_name: string | null; avatar_url: string | null }[]>([])
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0)
  /** token_to_book only: pay host token slice now vs full trip now */
  const [tokenPayMode, setTokenPayMode] = useState<'token' | 'full'>('token')

  const perPersonForBooking = variantTiers?.length
    ? variantTiers[selectedVariantIndex].price_paise
    : pricePerPersonPaise

  async function searchAndAddFriend() {
    if (!friendUsername.trim()) return
    setFriendSearching(true)
    const supabase = createClient()

    // Case-insensitive username search
    const { data } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .ilike('username', friendUsername.trim())
      .single()

    if (!data) {
      toast.error(`User @${friendUsername} not found`)
    } else {
      // Check if trying to add self
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (currentUser && data.id === currentUser.id) {
        toast.error("You're already in the group!")
      } else if (addedFriends.find(f => f.id === data.id)) {
        toast.error('Already added')
      } else {
        setAddedFriends(prev => [...prev, data])
        setFriendUsername('')
        toast.success(`Added @${data.username}`)
      }
    }
    setFriendSearching(false)
  }

  function removeFriend(id: string) {
    setAddedFriends(prev => prev.filter(f => f.id !== id))
  }

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

  // Calculate total discount
  const referredDiscount = isReferred && isFirstBooking ? REFERRED_DISCOUNT_PAISE : 0
  const creditsToApply = applyCredits ? Math.min(userCredits, perPersonForBooking * guests) : 0
  const totalDiscount = promoDiscount + referredDiscount + creditsToApply

  const router = useRouter()

  // Custom date request fields
  const [customDate, setCustomDate] = useState('')
  const [customGuests, setCustomGuests] = useState(1)
  const [contactNumber, setContactNumber] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [customLoading, setCustomLoading] = useState(false)

  const total = perPersonForBooking * guests
  const tripTotalAfterDiscounts = Math.max(0, total - totalDiscount)
  const tokenFirstSlicePaise =
    tokenBooking && tokenBooking.tokenAmountPaisePerPerson > 0
      ? Math.min(tokenBooking.tokenAmountPaisePerPerson * guests, tripTotalAfterDiscounts)
      : null
  const needsTokenVsFullChoice =
    !!tokenBooking &&
    tokenFirstSlicePaise != null &&
    tokenFirstSlicePaise < tripTotalAfterDiscounts
  const payFullForTokenTrip = needsTokenVsFullChoice && tokenPayMode === 'full'
  const dueNowDisplayPaise = payFullForTokenTrip ? tripTotalAfterDiscounts : tokenFirstSlicePaise ?? tripTotalAfterDiscounts
  const balanceLaterDisplayPaise = Math.max(0, tripTotalAfterDiscounts - dueNowDisplayPaise)
  // Tomorrow is the earliest bookable date (not today)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]
  const today = tomorrowStr // min date for date inputs
  const maxDate = getMaxDate()

  // All departure dates (past dates shown as disabled)
  const allDates = departureDates || []
  // Only future dates are bookable
  const futureDates = allDates.filter((d) => d >= tomorrowStr)

  async function handleBook() {
    if (!selectedDate) {
      toast.error('Please select a departure date')
      return
    }
    if (new Date(selectedDate) <= new Date()) {
      toast.error('Travel date must be in the future')
      return
    }
    setLoading(true)

    try {
      const result = await createRazorpayOrder(
        packageId,
        selectedDate,
        guests,
        applyCredits,
        {
          ...(variantTiers ? { priceVariantIndex: selectedVariantIndex } : {}),
          ...(promoDiscount > 0 && promoCode.trim() ? { promoCode: promoCode.trim() } : {}),
          ...(payFullForTokenTrip ? { payFullAmountForTokenTrip: true } : {}),
        },
      )

      if ('error' in result) {
        toast.error(result.error)
        setLoading(false)
        return
      }

      if ('instant' in result && result.instant) {
        const due = 'balanceDuePaise' in result && typeof result.balanceDuePaise === 'number' ? result.balanceDuePaise : 0
        toast.success(
          due > 0
            ? 'Spot secured! Pay the remaining balance anytime from My Trips.'
            : 'Booking confirmed!',
        )
        router.push(`/book/success?booking_id=${result.bookingId}`)
        setLoading(false)
        return
      }

      const options = {
        key: result.keyId,
        amount: result.amount,
        currency: result.currency,
        name: 'UnSOLO',
        description: packageTitle || 'Trip Booking',
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
            const due =
              'balanceDuePaise' in verification && typeof verification.balanceDuePaise === 'number'
                ? verification.balanceDuePaise
                : 0
            toast.success(
              due > 0
                ? 'Spot secured! Pay the remaining balance anytime from My Trips.'
                : 'Booking confirmed!',
            )
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

  async function handleCustomRequest() {
    if (!customDate) { toast.error('Please select a date'); return }
    if (new Date(customDate) <= new Date()) { toast.error('Date must be in the future'); return }
    if (new Date(customDate) > new Date(maxDate)) { toast.error('Date cannot be more than 2 years in the future'); return }
    if (!validateIndianPhone(contactNumber)) { toast.error('Enter a valid 10-digit Indian mobile number (starting with 6-9)'); return }
    if (!contactEmail || !contactEmail.includes('@')) { toast.error('Please enter a valid email'); return }

    setCustomLoading(true)
    const result = await submitCustomDateRequest(packageId, customDate, customGuests, contactNumber, contactEmail)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`Request submitted! Check ${contactEmail} for confirmation.`)
      setCustomDate('')
      setContactNumber('')
      setContactEmail('')
    }
    setCustomLoading(false)
  }

  // ── Group Invite Mode ──────────────────────────────────
  if (groupInvite) {
    const invitePerPerson =
      typeof groupInvite.per_person_paise === 'number' && groupInvite.per_person_paise > 0
        ? groupInvite.per_person_paise
        : pricePerPersonPaise
    const inviteDate = new Date(groupInvite.travel_date)
    const todayCheck = new Date()
    todayCheck.setHours(0, 0, 0, 0)
    const isExpired = inviteDate <= todayCheck
    const returnIso = tripEndDateIsoForBooking(groupInvite.travel_date, pkgCal)

    if (isExpired) {
      return (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-center">
            <p className="text-red-400 font-bold text-sm mb-1">Invite Expired</p>
            <p className="text-xs text-muted-foreground">
              The travel date ({formatDate(groupInvite.travel_date)}) has already passed. This group invite is no longer valid.
            </p>
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

        <div className="p-3 rounded-xl border border-primary/30 bg-primary/5">
          <p className="text-sm font-bold text-primary mb-1">Group Trip Invite</p>
          <p className="text-xs text-muted-foreground">
            {groupInvite.organizer_name} invited you to this trip!
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Travel Date</span>
            <span className="font-medium">
              {formatDate(groupInvite.travel_date)}
              {returnIso ? ` → ${formatDate(returnIso)}` : ''}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Guests</span>
            <span className="font-medium">1</span>
          </div>
          <div className="flex justify-between text-sm border-t border-border pt-2">
            <span className="font-bold">Your Share</span>
            <span className="font-bold text-primary">{formatPrice(invitePerPerson)}</span>
          </div>
        </div>

        <Button
          onClick={async () => {
            setLoading(true)
            const result = await createRazorpayOrder(packageId, groupInvite.travel_date, 1, false, {
              groupBookingId: groupInvite.id,
            })
            if ('error' in result) {
              toast.error(result.error)
              setLoading(false)
              return
            }
            const options = {
              key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
              amount: result.amount,
              currency: 'INR',
              name: 'UnSOLO',
              description: packageTitle || 'Group Trip Payment',
              order_id: result.orderId,
              handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
                const confirmation = await confirmPayment(
                  response.razorpay_order_id,
                  response.razorpay_payment_id,
                  response.razorpay_signature,
                )
                if ('error' in confirmation) {
                  toast.error(confirmation.error)
                } else {
                  // Mark group member as paid
                  const { completeGroupPayment } = await import('@/actions/group-booking')
                  await completeGroupPayment(groupInvite.id)
                  toast.success('Payment complete!')
                  router.push('/bookings')
                }
              },
              prefill: {},
              theme: { color: '#D4A017' },
            }
            const rzp = new (window as unknown as { Razorpay: new (opts: unknown) => { open: () => void } }).Razorpay(options)
            rzp.open()
            setLoading(false)
          }}
          disabled={loading}
          className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90"
          size="lg"
        >
          {loading ? 'Processing...' : 'Complete Payment'}
        </Button>
      </div>
    )
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

      {/* Tabs */}
      <div className="flex rounded-lg bg-secondary/50 p-1">
        <button
          onClick={() => setTab('fixed')}
          className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-colors ${
            tab === 'fixed' ? 'bg-primary text-black' : 'text-muted-foreground hover:text-white'
          }`}
        >
          Fixed Dates
        </button>
        <button
          onClick={() => setTab('custom')}
          className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-colors ${
            tab === 'custom' ? 'bg-primary text-black' : 'text-muted-foreground hover:text-white'
          }`}
        >
          Custom
        </button>
        <button
          onClick={() => setTab('group')}
          className={`flex-1 py-2 px-3 rounded-md text-xs font-medium transition-colors ${
            tab === 'group' ? 'bg-primary text-black' : 'text-muted-foreground hover:text-white'
          }`}
        >
          <Users className="h-3 w-3 inline mr-1" />
          Group
        </button>
      </div>

      {tab === 'fixed' && (
        <>
          {variantTiers && variantTiers.length >= 2 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Choose your option</label>
              <div className="space-y-2">
                {variantTiers.map((t, i) => (
                  <label
                    key={i}
                    className={`flex gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedVariantIndex === i
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-secondary/30 hover:border-primary/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="price-tier"
                      className="mt-1 accent-primary"
                      checked={selectedVariantIndex === i}
                      onChange={() => setSelectedVariantIndex(i)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-foreground">{formatPrice(t.price_paise)}</div>
                      <div className="text-xs text-muted-foreground">{t.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Departure date selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" /> Select Departure
            </label>
            {allDates.length > 0 ? (
              <div className="grid gap-2">
                {allDates.map((date) => {
                  const isPast = date < tomorrowStr
                  const slots = availableSlots[date] ?? maxGroupSize
                  const soldOut = !isPast && slots <= 0
                  const isDisabled = isPast || soldOut
                  return (
                  <button
                    key={date}
                    onClick={() => !isDisabled && setSelectedDate(date)}
                    disabled={isDisabled}
                    className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                      isPast
                        ? 'opacity-40 cursor-not-allowed border-border bg-secondary/20 line-through'
                        : soldOut
                        ? 'opacity-40 cursor-not-allowed border-border bg-secondary/30'
                        : selectedDate === date
                        ? 'border-primary bg-primary/15 text-foreground font-medium'
                        : 'border-border bg-secondary/30 text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    }`}
                  >
                    <span className="flex items-center justify-between w-full">
                      <span>{travelRangeLabel(date)}</span>
                      <span className={`text-[10px] font-medium ${
                        isPast ? 'text-muted-foreground' : soldOut ? 'text-red-400' : slots <= 3 ? 'text-yellow-400' : 'text-green-400'
                      }`}>
                        {isPast ? 'Passed' : soldOut ? 'Sold out' : `${slots} spots left`}
                      </span>
                    </span>
                  </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-2">
                No upcoming dates scheduled. Try requesting a custom date.
              </p>
            )}
          </div>

          {/* Guests */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Guests</label>
            {(() => {
              const maxAllowed = selectedDate ? (availableSlots[selectedDate] ?? maxGroupSize) : maxGroupSize
              return (
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-border" onClick={() => setGuests(Math.max(1, guests - 1))}>-</Button>
                  <span className="font-bold text-lg min-w-[2rem] text-center">{guests}</span>
                  <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-border" onClick={() => setGuests(Math.min(maxAllowed, guests + 1))}>+</Button>
                  <span className="text-xs text-muted-foreground">
                    {selectedDate ? `${maxAllowed} available` : `Max ${maxGroupSize}`}
                  </span>
                </div>
              )
            })()}
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

          {needsTokenVsFullChoice && (
            <div className="rounded-lg border border-border bg-secondary/30 p-2.5 space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground px-0.5">Payment today</p>
              <div className="grid grid-cols-2 gap-1.5">
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                    tokenPayMode === 'token'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-transparent bg-background/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <input
                    type="radio"
                    name="token-pay-mode"
                    className="accent-primary h-3.5 w-3.5 shrink-0"
                    checked={tokenPayMode === 'token'}
                    onChange={() => setTokenPayMode('token')}
                  />
                  <span className="leading-tight">Pay token</span>
                </label>
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors ${
                    tokenPayMode === 'full'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-transparent bg-background/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <input
                    type="radio"
                    name="token-pay-mode"
                    className="accent-primary h-3.5 w-3.5 shrink-0"
                    checked={tokenPayMode === 'full'}
                    onChange={() => setTokenPayMode('full')}
                  />
                  <span className="leading-tight">Pay full amount</span>
                </label>
              </div>
            </div>
          )}

          {/* Price breakdown */}
          <div className="bg-secondary/50 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>{formatPrice(perPersonForBooking)} x {guests} person{guests > 1 ? 's' : ''}</span>
              <span>{formatPrice(total)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-green-500 text-xs">
                <span>Discount</span>
                <span>-{formatPrice(totalDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-foreground pt-1 border-t border-border">
              <span>Trip total</span>
              <span className="text-primary">{formatPrice(tripTotalAfterDiscounts)}</span>
            </div>
            {needsTokenVsFullChoice && (
              <>
                <div className="flex justify-between text-xs text-amber-600/95 dark:text-amber-400/95 pt-1">
                  <span>{payFullForTokenTrip ? 'Due now' : 'Due now (token, max)'}</span>
                  <span>{formatPrice(dueNowDisplayPaise)}</span>
                </div>
                {balanceLaterDisplayPaise > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Balance later (My Trips)</span>
                    <span>{formatPrice(balanceLaterDisplayPaise)}</span>
                  </div>
                )}
              </>
            )}
            {tokenFirstSlicePaise != null && tokenFirstSlicePaise >= tripTotalAfterDiscounts && (
              <p className="text-[11px] text-muted-foreground pt-1">
                Your discounts bring the trip total to the same or less than the host token—you’ll pay the full trip
                amount at checkout.
              </p>
            )}
          </div>

          {needsTokenVsFullChoice && tokenPayMode === 'token' && (
            <div className="p-3 rounded-lg border border-primary/25 bg-primary/5 text-xs text-muted-foreground">
              The host set a <span className="font-semibold text-foreground">token</span> to lock your spot. Wallet
              credits and promos apply to the trip total; the first charge is capped at the token slice above.
            </div>
          )}
          {needsTokenVsFullChoice && tokenPayMode === 'full' && (
            <div className="p-3 rounded-lg border border-border bg-secondary/40 text-xs text-muted-foreground">
              You’ll pay the full trip total in one checkout (after discounts and any credits you apply).
            </div>
          )}

          <Button
            onClick={handleBook}
            disabled={loading || !selectedDate}
            className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90 glow-gold"
            size="lg"
          >
            {loading
              ? 'Processing...'
              : !tokenBooking
                ? 'Book This Trip'
                : needsTokenVsFullChoice && tokenPayMode === 'token'
                  ? 'Pay token & book'
                  : 'Pay and book'}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Secure payment via Razorpay. UPI, Cards, Netbanking accepted.
          </p>
        </>
      )}

      {tab === 'custom' && (
        /* Custom date request tab */
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Want a different date? Submit a request and we&apos;ll get back to you.
          </p>

          <div className="space-y-1">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" /> Preferred Date
            </label>
            <Input
              type="date"
              min={today}
              max={maxDate}
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="bg-secondary border-border"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-primary" /> Number of People
            </label>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-border" onClick={() => setCustomGuests(Math.max(1, customGuests - 1))}>-</Button>
              <span className="font-bold text-lg min-w-[2rem] text-center">{customGuests}</span>
              <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-border" onClick={() => setCustomGuests(Math.min(maxGroupSize, customGuests + 1))}>+</Button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-primary" /> Contact Number
            </label>
            <Input
              type="tel"
              placeholder="9876543210"
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
              maxLength={10}
              inputMode="numeric"
              className="bg-secondary border-border"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-primary" /> Email
            </label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="bg-secondary border-border"
            />
          </div>

          <Button
            onClick={handleCustomRequest}
            disabled={customLoading}
            className="w-full bg-secondary text-white font-bold hover:bg-secondary/80 border border-border"
            size="lg"
          >
            {customLoading ? 'Submitting...' : (
              <><Send className="mr-2 h-4 w-4" /> Submit Request</>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            No payment required. We&apos;ll contact you to confirm availability.
          </p>
        </div>
      )}

      {tab === 'group' && (
        <div className="space-y-3">
          {inviteCode ? (
            <div className="space-y-3">
              <div className="text-center p-4 rounded-xl border border-green-500/30 bg-green-500/10">
                <p className="text-green-400 font-bold text-sm mb-2">Group Trip Created!</p>
                <p className="text-xs text-muted-foreground mb-2">
                  {groupPayMode === 'full'
                    ? 'You paid for the full group. Your friends have been notified!'
                    : 'Payment links sent to your friends via notifications.'}
                </p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="text-xs text-muted-foreground">Invite code:</span>
                  <code className="text-sm font-mono font-bold text-primary bg-secondary px-3 py-1 rounded-lg tracking-widest">
                    {inviteCode}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(inviteCode)
                      setCodeCopied(true)
                      setTimeout(() => setCodeCopied(false), 2000)
                    }}
                    className="p-1 rounded bg-secondary hover:bg-secondary/80"
                  >
                    {codeCopied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                  </button>
                </div>
              </div>
              {groupPayMode === 'split' && createdGroupId && (
                <Button
                  onClick={() => router.push(`/packages/${packageSlug}?group=${createdGroupId}`)}
                  className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90"
                >
                  Pay Your Share ({formatPrice(perPersonForBooking)})
                </Button>
              )}
              <Button
                onClick={() => router.push('/bookings')}
                variant={groupPayMode === 'split' ? 'outline' : 'default'}
                className={groupPayMode === 'split' ? 'w-full border-border' : 'w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90'}
              >
                Go to My Trips
              </Button>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Plan a group trip — add friends by username and choose how to pay.
              </p>

              {variantTiers && variantTiers.length >= 2 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Price option (whole group)</label>
                  <div className="space-y-2">
                    {variantTiers.map((t, i) => (
                      <label
                        key={i}
                        className={`flex gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          selectedVariantIndex === i
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-secondary/30 hover:border-primary/40'
                        }`}
                      >
                        <input
                          type="radio"
                          name="group-price-tier"
                          className="mt-1 accent-primary"
                          checked={selectedVariantIndex === i}
                          onChange={() => setSelectedVariantIndex(i)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-foreground">{formatPrice(t.price_paise)}</div>
                          <div className="text-xs text-muted-foreground">{t.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Travel date */}
              <div className="space-y-1">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-primary" /> Travel Date
                </label>
                {futureDates.length > 0 ? (
                  <select
                    value={groupDate}
                    onChange={e => setGroupDate(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="">Select a date</option>
                    {futureDates.map(d => (
                      <option key={d} value={d}>
                        {travelRangeLabel(d)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input type="date" min={today} max={maxDate} value={groupDate} onChange={e => setGroupDate(e.target.value)} className="bg-secondary border-border" />
                )}
              </div>

              {/* Add friends */}
              <div className="space-y-1">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <UserPlus className="h-3.5 w-3.5 text-primary" /> Add Friends
                </label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter username..."
                    value={friendUsername}
                    onChange={e => setFriendUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), searchAndAddFriend())}
                    className="bg-secondary border-border flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={searchAndAddFriend}
                    disabled={friendSearching || !friendUsername.trim()}
                    className="border-border px-3"
                  >
                    {friendSearching ? '...' : 'Add'}
                  </Button>
                </div>
              </div>

              {/* Added friends list */}
              {addedFriends.length > 0 && (
                <div className="space-y-1.5">
                  {addedFriends.map(f => (
                    <div key={f.id} className="flex items-center justify-between bg-secondary/50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                          {(f.full_name || f.username).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-sm font-medium">{f.full_name || f.username}</span>
                          <span className="text-xs text-muted-foreground ml-1">@{f.username}</span>
                        </div>
                      </div>
                      <button onClick={() => removeFriend(f.id)} className="text-muted-foreground hover:text-red-400">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Payment mode */}
              {addedFriends.length > 0 && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Payment</label>
                  <div className="flex rounded-lg bg-secondary/50 p-1">
                    <button
                      onClick={() => setGroupPayMode('split')}
                      className={`flex-1 py-2 px-2 rounded-md text-xs font-medium transition-colors ${
                        groupPayMode === 'split' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Split Payment
                    </button>
                    <button
                      onClick={() => setGroupPayMode('full')}
                      className={`flex-1 py-2 px-2 rounded-md text-xs font-medium transition-colors ${
                        groupPayMode === 'full' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Pay Full
                    </button>
                  </div>
                </div>
              )}

              {/* Price breakdown */}
              <div className="bg-secondary/50 rounded-lg p-3 space-y-1 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>Per person</span>
                  <span>{formatPrice(perPersonForBooking)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Total members</span>
                  <span>{addedFriends.length + 1} (you + {addedFriends.length})</span>
                </div>
                <div className="flex justify-between font-bold text-foreground pt-1 border-t border-border">
                  <span>{groupPayMode === 'full' ? 'You pay' : 'Your share'}</span>
                  <span className="text-primary">
                    {groupPayMode === 'full'
                      ? formatPrice(perPersonForBooking * (addedFriends.length + 1))
                      : formatPrice(perPersonForBooking)}
                  </span>
                </div>
                {groupPayMode === 'split' && addedFriends.length > 0 && (
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Each friend gets a payment notification for {formatPrice(perPersonForBooking)}
                  </p>
                )}
              </div>

              <Button
                onClick={async () => {
                  if (!groupDate) { toast.error('Select a travel date'); return }
                  if (addedFriends.length === 0) { toast.error('Add at least one friend'); return }
                  setGroupLoading(true)
                  const result = await createGroupBooking(
                    packageId,
                    groupDate,
                    addedFriends.length + 1,
                    addedFriends.map(f => f.id),
                    variantTiers ? selectedVariantIndex : undefined,
                  )
                  if ('error' in result) {
                    toast.error(result.error)
                  } else {
                    setInviteCode(result.inviteCode!)
                    setCreatedGroupId(result.groupId!)
                    toast.success('Group trip created! Friends notified.')
                  }
                  setGroupLoading(false)
                }}
                disabled={groupLoading || !groupDate || addedFriends.length === 0}
                className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90"
                size="lg"
              >
                {groupLoading ? 'Creating...' : (
                  <><Users className="mr-2 h-4 w-4" /> {groupPayMode === 'full' ? 'Pay & Create Group' : 'Create & Send Payment Links'}</>
                )}
              </Button>
              <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                ⏰ All members (including you) must complete payment within <strong>24 hours</strong>.
                Unpaid members&apos; trips are auto-cancelled. Paid members&apos; bookings remain confirmed.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
