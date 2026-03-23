'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createRazorpayOrder, confirmPayment, submitCustomDateRequest } from '@/actions/booking'
import { createGroupBooking } from '@/actions/group-booking'
import { formatPrice, formatDate, formatDateRange, validateIndianPhone, getMaxDate } from '@/lib/utils'
import { toast } from 'sonner'
import Script from 'next/script'
import { Calendar, Phone, Mail, Users, Send, Copy, Check, X, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void
      on: (event: string, handler: () => void) => void
    }
  }
}

interface BookingFormClientProps {
  packageId: string
  packageSlug: string
  pricePerPersonPaise: number
  maxGroupSize: number
  packageTitle?: string
  departureDates?: string[] | null
  durationDays?: number
}

export function BookingFormClient({
  packageId,
  packageSlug,
  pricePerPersonPaise,
  maxGroupSize,
  packageTitle,
  departureDates,
  durationDays,
}: BookingFormClientProps) {
  const [tab, setTab] = useState<'fixed' | 'custom' | 'group'>('fixed')
  const [guests, setGuests] = useState(1)
  const [selectedDate, setSelectedDate] = useState('')
  const [loading, setLoading] = useState(false)

  // Group booking state
  const [groupDate, setGroupDate] = useState('')
  const [groupLoading, setGroupLoading] = useState(false)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const [groupPayMode, setGroupPayMode] = useState<'full' | 'split'>('split')
  // Add friends by username
  const [friendUsername, setFriendUsername] = useState('')
  const [friendSearching, setFriendSearching] = useState(false)
  const [addedFriends, setAddedFriends] = useState<{ id: string; username: string; full_name: string | null; avatar_url: string | null }[]>([])

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
  const router = useRouter()

  // Custom date request fields
  const [customDate, setCustomDate] = useState('')
  const [customGuests, setCustomGuests] = useState(1)
  const [contactNumber, setContactNumber] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [customLoading, setCustomLoading] = useState(false)

  const total = pricePerPersonPaise * guests
  const today = new Date().toISOString().split('T')[0]
  const maxDate = getMaxDate()

  // Filter only future dates
  const futureDates = (departureDates || []).filter((d) => d >= today)

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
      const result = await createRazorpayOrder(packageId, selectedDate, guests)

      if ('error' in result) {
        toast.error(result.error)
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
          const verification = await confirmPayment(
            response.razorpay_order_id,
            response.razorpay_payment_id,
            response.razorpay_signature,
          )
          if (verification.success) {
            toast.success('Booking confirmed!')
            router.push(`/book/success?booking_id=${verification.bookingId}`)
          } else {
            toast.error(verification.error || 'Payment verification failed')
          }
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

  return (
    <div className="space-y-4">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />

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
          {/* Departure date selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" /> Select Departure
            </label>
            {futureDates.length > 0 ? (
              <div className="grid gap-2">
                {futureDates.map((date) => (
                  <button
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                      selectedDate === date
                        ? 'border-primary bg-primary/10 text-white'
                        : 'border-border bg-secondary/30 text-muted-foreground hover:border-primary/40 hover:text-white'
                    }`}
                  >
                    {durationDays ? formatDateRange(date, durationDays) : formatDate(date)}
                  </button>
                ))}
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
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-border" onClick={() => setGuests(Math.max(1, guests - 1))}>-</Button>
              <span className="font-bold text-lg min-w-[2rem] text-center">{guests}</span>
              <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-border" onClick={() => setGuests(Math.min(maxGroupSize, guests + 1))}>+</Button>
              <span className="text-xs text-muted-foreground">Max {maxGroupSize}</span>
            </div>
          </div>

          {/* Price breakdown */}
          <div className="bg-secondary/50 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>{formatPrice(pricePerPersonPaise)} x {guests} person{guests > 1 ? 's' : ''}</span>
              <span>{formatPrice(total)}</span>
            </div>
            <div className="flex justify-between font-bold text-white pt-1 border-t border-border">
              <span>Total</span>
              <span className="text-primary">{formatPrice(total)}</span>
            </div>
          </div>

          <Button
            onClick={handleBook}
            disabled={loading || !selectedDate}
            className="w-full bg-primary text-black font-bold hover:bg-primary/90 glow-gold"
            size="lg"
          >
            {loading ? 'Processing...' : 'Book This Trip'}
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
              <Button onClick={() => router.push('/bookings')} className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90">
                Go to My Trips
              </Button>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Plan a group trip — add friends by username and choose how to pay.
              </p>

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
                        {durationDays ? formatDateRange(d, durationDays) : formatDate(d)}
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
                  <span>{formatPrice(pricePerPersonPaise)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Total members</span>
                  <span>{addedFriends.length + 1} (you + {addedFriends.length})</span>
                </div>
                <div className="flex justify-between font-bold text-foreground pt-1 border-t border-border">
                  <span>{groupPayMode === 'full' ? 'You pay' : 'Your share'}</span>
                  <span className="text-primary">
                    {groupPayMode === 'full'
                      ? formatPrice(pricePerPersonPaise * (addedFriends.length + 1))
                      : formatPrice(pricePerPersonPaise)}
                  </span>
                </div>
                {groupPayMode === 'split' && addedFriends.length > 0 && (
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Each friend gets a payment notification for {formatPrice(pricePerPersonPaise)}
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
                  )
                  if ('error' in result) {
                    toast.error(result.error)
                  } else {
                    setInviteCode(result.inviteCode!)
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
            </>
          )}
        </div>
      )}
    </div>
  )
}
