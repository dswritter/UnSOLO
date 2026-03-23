'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Gift, Tag, Trophy, Users, ToggleLeft, ToggleRight, CreditCard } from 'lucide-react'
import { toast } from 'sonner'

interface Offer {
  id: string
  name: string
  type: string
  discount_paise: number
  min_trips: number
  promo_code: string | null
  max_uses: number | null
  used_count: number
  is_active: boolean
  valid_until: string | null
  created_at: string
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

interface Props {
  offers: Offer[]
  createOffer: (fd: FormData) => Promise<{ error?: string; success?: boolean }>
  toggleOffer: (id: string, isActive: boolean) => Promise<{ success?: boolean }>
  grantCredits: (username: string, amount: number, reason: string) => Promise<{ error?: string; success?: boolean; userName?: string }>
}

export function DiscountsClient({ offers, createOffer, toggleOffer, grantCredits }: Props) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showGrantForm, setShowGrantForm] = useState(false)
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
            <div className="space-y-1">
              <label className="text-xs font-medium">Discount Amount (₹)</label>
              <Input name="discountPaise" type="number" min="1" placeholder="500" required className="bg-secondary border-border"
                onChange={e => e.target.form!.discountPaise.value = String(parseInt(e.target.value) * 100 || '')}
              />
              <input type="hidden" name="discountPaise" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Promo Code (for promo type)</label>
              <Input name="promoCode" placeholder="SUMMER2026" className="bg-secondary border-border uppercase" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
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
            <div key={offer.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
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
                    <span className="font-medium text-primary">₹{(offer.discount_paise / 100).toLocaleString('en-IN')} off</span>
                    {offer.promo_code && <span>Code: <code className="font-mono bg-secondary px-1.5 py-0.5 rounded">{offer.promo_code}</code></span>}
                    {offer.min_trips > 0 && <span>Min {offer.min_trips} trips</span>}
                    <span>{offer.used_count}{offer.max_uses ? `/${offer.max_uses}` : ''} used</span>
                    {offer.valid_until && <span>Until {new Date(offer.valid_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                  </div>
                </div>
              </div>
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
          )
        })}
      </div>
    </div>
  )
}
