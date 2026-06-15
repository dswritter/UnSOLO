'use client'

import React, { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Gift, Tag, Trophy, Users, ToggleLeft, ToggleRight, CreditCard, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { formatDiscountLabel } from '@/lib/checkout-promos'

interface Offer {
  id: string
  name: string
  type: string
  discount_paise: number | null
  discount_kind?: 'fixed' | 'percent' | 'free_guests' | null
  discount_percent?: number | null
  discount_percent_cap_paise?: number | null
  free_guest_count?: number | null
  min_trips: number
  promo_code: string | null
  max_uses: number | null
  used_count: number
  is_active: boolean
  valid_until: string | null
  created_at: string
  checkout_visibility?: 'auto' | 'manual_only' | null
  scope_listing_type?: 'all' | 'trips' | 'stays' | 'activities' | 'rentals' | 'getting_around' | null
  host?: { username: string; full_name: string | null } | null
  package?: { slug: string; title: string } | null
  service_listing?: { slug: string; title: string; type: string } | null
}

const TYPE_ICONS: Record<string, typeof Tag> = {
  promo: Tag,
  loyalty: Trophy,
  custom: Gift,
  referral: Users,
}

const TYPE_COLORS: Record<string, string> = {
  promo: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
  loyalty: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700',
  custom: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
  referral: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700',
}

const SCOPE_TYPE_OPTIONS = [
  { value: 'all', label: 'All listings' },
  { value: 'trips', label: 'Trips' },
  { value: 'stays', label: 'Stays' },
  { value: 'activities', label: 'Activities' },
  { value: 'rentals', label: 'Rentals' },
  { value: 'getting_around', label: 'Getting Around' },
] as const

/** Discount-kind selector + the inputs for the chosen kind. Used in create + edit forms. */
function DiscountKindFields({
  defaultKind = 'fixed',
  defaultRupees,
  defaultPercent,
  defaultCapRupees,
  defaultFreeCount,
}: {
  defaultKind?: 'fixed' | 'percent' | 'free_guests'
  defaultRupees?: number | string
  defaultPercent?: number | string
  defaultCapRupees?: number | string
  defaultFreeCount?: number | string
}) {
  const [kind, setKind] = useState<'fixed' | 'percent' | 'free_guests'>(defaultKind)
  return (
    <>
      <div className="space-y-1">
        <label className="text-xs font-medium">Discount kind</label>
        <select
          name="discountKind"
          value={kind}
          onChange={e => setKind(e.target.value as typeof kind)}
          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
        >
          <option value="fixed">Fixed (₹ off)</option>
          <option value="percent">Percentage (% off)</option>
          <option value="free_guests">Pay for fewer (free guests)</option>
        </select>
      </div>
      {kind === 'fixed' && (
        <div className="space-y-1">
          <label className="text-xs font-medium">Discount amount (₹)</label>
          <Input name="discountRupees" type="number" min="1" defaultValue={defaultRupees} placeholder="500" className="bg-secondary border-border text-sm" />
        </div>
      )}
      {kind === 'percent' && (
        <>
          <div className="space-y-1">
            <label className="text-xs font-medium">Percent (%)</label>
            <Input name="discountPercent" type="number" min="1" max="100" defaultValue={defaultPercent} placeholder="10" className="bg-secondary border-border text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Max cap ₹ (optional)</label>
            <Input name="discountPercentCap" type="number" min="1" defaultValue={defaultCapRupees} placeholder="2000" className="bg-secondary border-border text-sm" />
          </div>
        </>
      )}
      {kind === 'free_guests' && (
        <div className="space-y-1">
          <label className="text-xs font-medium">Free guests (pay for n − this)</label>
          <Input name="freeGuestCount" type="number" min="1" defaultValue={defaultFreeCount ?? 1} placeholder="1" className="bg-secondary border-border text-sm" />
        </div>
      )}
    </>
  )
}

interface Props {
  offers: Offer[]
  createOffer: (fd: FormData) => Promise<{ error?: string; success?: boolean }>
  toggleOffer: (id: string, isActive: boolean) => Promise<{ success?: boolean }>
  grantCredits: (username: string, amount: number, reason: string) => Promise<{ error?: string; success?: boolean; userName?: string }>
  editOffer: (id: string, fd: FormData) => Promise<{ error?: string; success?: boolean }>
}

export function DiscountsClient({ offers, createOffer, toggleOffer, grantCredits, editOffer }: Props) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showGrantForm, setShowGrantForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await createOffer(fd)
      if (res.error) toast.error(res.error)
      else { toast.success('Offer created!'); setShowCreateForm(false) }
    })
  }

  function handleGrant(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const username = fd.get('username') as string
    const amount = parseInt(fd.get('amount') as string) * 100 // convert to paise
    const reason = fd.get('reason') as string
    startTransition(async () => {
      const res = await grantCredits(username, amount, reason)
      if (res.error) toast.error(res.error)
      else { toast.success(`Credits granted to ${res.userName}!`); setShowGrantForm(false) }
    })
  }

  return (
    <div className="space-y-6">
      {/* Action buttons */}
      <div className="flex gap-3">
        <Button onClick={() => setShowCreateForm(!showCreateForm)} className="bg-primary text-primary-foreground">
          <Plus className="mr-2 h-4 w-4" /> Create Offer
        </Button>
        <Button onClick={() => setShowGrantForm(!showGrantForm)} variant="outline" className="border-border">
          <CreditCard className="mr-2 h-4 w-4" /> Grant Credits
        </Button>
      </div>

      {/* Create offer form */}
      {showCreateForm && (
        <form onSubmit={handleCreate} className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-bold">New Discount Offer</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Name</label>
              <Input name="name" placeholder="Summer Sale 2026" required className="bg-secondary border-border" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Type</label>
              <select name="type" required className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm">
                <option value="promo">Promo Code</option>
                <option value="loyalty">Loyalty (min trips)</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DiscountKindFields />
            <div className="space-y-1">
              <label className="text-xs font-medium">Promo Code (for promo type)</label>
              <Input name="promoCode" placeholder="SUMMER2026" className="bg-secondary border-border uppercase" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Checkout visibility</label>
              <select name="checkoutVisibility" defaultValue="auto" className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm">
                <option value="auto">Show on "Have a promo code?"</option>
                <option value="manual_only">Manual entry only</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Listing type scope</label>
              <select name="scopeListingType" defaultValue="all" className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm">
                {SCOPE_TYPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Min Trips (loyalty)</label>
              <Input name="minTrips" type="number" min="0" defaultValue="0" className="bg-secondary border-border" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Max Uses (empty=unlimited)</label>
              <Input name="maxUses" type="number" min="1" placeholder="100" className="bg-secondary border-border" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Valid Until</label>
              <Input name="validUntil" type="date" className="bg-secondary border-border" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Exact scope</label>
              <select name="scopeMode" defaultValue="global" className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm">
                <option value="global">Global</option>
                <option value="host">Host-wide</option>
                <option value="package">Specific trip</option>
                <option value="service_listing">Specific service listing</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Host username</label>
              <Input name="hostUsername" placeholder="host_username" className="bg-secondary border-border" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Trip slug</label>
              <Input name="packageSlug" placeholder="kasol-weekend-getaway" className="bg-secondary border-border" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Listing slug</label>
              <Input name="serviceListingSlug" placeholder="riverside-stay-kasol" className="bg-secondary border-border" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={isPending} className="bg-primary text-primary-foreground">
              {isPending ? 'Creating...' : 'Create Offer'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)} className="border-border">Cancel</Button>
          </div>
        </form>
      )}

      {/* Grant credits form */}
      {showGrantForm && (
        <form onSubmit={handleGrant} className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-bold">Grant Credits to User</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Username</label>
              <Input name="username" placeholder="priyatravels" required className="bg-secondary border-border" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Amount (₹)</label>
              <Input name="amount" type="number" min="1" placeholder="500" required className="bg-secondary border-border" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Reason</label>
              <Input name="reason" placeholder="Loyalty reward for 5+ trips" required className="bg-secondary border-border" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={isPending} className="bg-primary text-primary-foreground">
              {isPending ? 'Granting...' : 'Grant Credits'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowGrantForm(false)} className="border-border">Cancel</Button>
          </div>
        </form>
      )}

      {/* Offers list */}
      <div className="space-y-3">
        {offers.length === 0 && (
          <p className="text-center text-muted-foreground py-12">No discount offers yet. Create one above!</p>
        )}
        {offers.map(offer => {
          const Icon = TYPE_ICONS[offer.type] || Tag
          return (
            <React.Fragment key={offer.id}>
            <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{offer.name}</span>
                    <Badge className={`text-[10px] border ${TYPE_COLORS[offer.type] || ''}`}>
                      {offer.type}
                    </Badge>
                    {!offer.is_active && <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-[10px]">Inactive</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                    <span className="font-medium text-primary">{formatDiscountLabel(offer)}</span>
                    {offer.promo_code && <span>Code: <code className="font-mono bg-secondary px-1.5 py-0.5 rounded">{offer.promo_code}</code></span>}
                    <span>{offer.checkout_visibility === 'manual_only' ? 'Manual only' : 'Auto shown'}</span>
                    <span>{SCOPE_TYPE_OPTIONS.find(o => o.value === (offer.scope_listing_type || 'all'))?.label || 'All listings'}</span>
                    {offer.host && <span>Host: @{offer.host.username}</span>}
                    {offer.package && <span>Trip: {offer.package.slug}</span>}
                    {offer.service_listing && <span>Listing: {offer.service_listing.slug}</span>}
                    {offer.min_trips > 0 && <span>Min {offer.min_trips} trips</span>}
                    <span>{offer.used_count}{offer.max_uses ? `/${offer.max_uses}` : ''} used</span>
                    {offer.valid_until
                      ? <span>Until {new Date(offer.valid_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      : <span>Never expires</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingId(editingId === offer.id ? null : offer.id)}
                  className="text-muted-foreground hover:text-primary transition-colors"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => startTransition(async () => {
                    await toggleOffer(offer.id, !offer.is_active)
                    toast.success(offer.is_active ? 'Offer deactivated' : 'Offer activated')
                  })}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title={offer.is_active ? 'Deactivate' : 'Activate'}
                >
                  {offer.is_active
                    ? <ToggleRight className="h-6 w-6 text-green-500" />
                    : <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                  }
                </button>
              </div>
            </div>
            {/* Inline edit form */}
            {editingId === offer.id && (
              <form
                onSubmit={e => {
                  e.preventDefault()
                  const fd = new FormData(e.currentTarget)
                  startTransition(async () => {
                    const res = await editOffer(offer.id, fd)
                    if (res.error) toast.error(res.error)
                    else { toast.success('Offer updated!'); setEditingId(null) }
                  })
                }}
                className="bg-card border border-border rounded-xl p-4 space-y-3"
              >
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Name</label>
                    <Input name="name" defaultValue={offer.name} className="bg-secondary border-border text-sm" />
                  </div>
                  <DiscountKindFields
                    defaultKind={offer.discount_kind ?? 'fixed'}
                    defaultRupees={offer.discount_paise != null ? Math.round(offer.discount_paise / 100) : undefined}
                    defaultPercent={offer.discount_percent ?? undefined}
                    defaultCapRupees={offer.discount_percent_cap_paise != null ? Math.round(offer.discount_percent_cap_paise / 100) : undefined}
                    defaultFreeCount={offer.free_guest_count ?? undefined}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Promo Code</label>
                    <Input name="promoCode" defaultValue={offer.promo_code || ''} className="bg-secondary border-border text-sm uppercase" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Max Uses</label>
                    <Input name="maxUses" type="number" min="1" defaultValue={offer.max_uses || ''} placeholder="Unlimited" className="bg-secondary border-border text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Valid Until</label>
                    <Input name="validUntil" type="date" defaultValue={offer.valid_until?.split('T')[0] || ''} className="bg-secondary border-border text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Checkout visibility</label>
                    <select name="checkoutVisibility" defaultValue={offer.checkout_visibility || 'auto'} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm">
                      <option value="auto">Show on "Have a promo code?"</option>
                      <option value="manual_only">Manual entry only</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Listing type scope</label>
                    <select name="scopeListingType" defaultValue={offer.scope_listing_type || 'all'} className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm">
                      {SCOPE_TYPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Exact scope</label>
                    <select
                      name="scopeMode"
                      defaultValue={offer.package ? 'package' : offer.service_listing ? 'service_listing' : offer.host ? 'host' : 'global'}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="global">Global</option>
                      <option value="host">Host-wide</option>
                      <option value="package">Specific trip</option>
                      <option value="service_listing">Specific service listing</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Host username</label>
                    <Input name="hostUsername" defaultValue={offer.host?.username || ''} className="bg-secondary border-border text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Trip slug</label>
                    <Input name="packageSlug" defaultValue={offer.package?.slug || ''} className="bg-secondary border-border text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Listing slug</label>
                    <Input name="serviceListingSlug" defaultValue={offer.service_listing?.slug || ''} className="bg-secondary border-border text-sm" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={isPending} className="bg-primary text-primary-foreground text-xs">
                    {isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditingId(null)} className="border-border text-xs">Cancel</Button>
                </div>
              </form>
            )}
          </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
