'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { toast } from 'sonner'
import { Phone, MessageCircle, User as UserIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { startDirectMessage } from '@/actions/profile'

/**
 * Post-booking host contact block. Shown once a service booking is
 * confirmed — modeled after booking.com's behavior where the traveler
 * sees the host's real phone number and a way to chat. The `phone_public`
 * flag on the profile is intentionally bypassed here: once a traveler
 * has paid and a booking is confirmed, they have a legitimate need to
 * reach the host, regardless of the host's general privacy preference.
 */
export function HostContactCard({
  host,
}: {
  host: {
    id: string
    username: string | null
    full_name: string | null
    phone_number: string | null
    avatar_url: string | null
  }
}) {
  const router = useRouter()
  const [openingChat, setOpeningChat] = useState(false)

  const displayName = host.full_name || host.username || 'Your host'
  // Normalize to a tel:-friendly string — strip everything except digits
  // and a leading +. Phone numbers in Supabase may include spaces or
  // parens that break `tel:` on some dialers.
  const telHref = host.phone_number
    ? `tel:${host.phone_number.replace(/[^\d+]/g, '')}`
    : null

  async function handleMessageHost() {
    setOpeningChat(true)
    const res = await startDirectMessage(host.id)
    setOpeningChat(false)
    if ('error' in res && res.error) {
      toast.error(res.error)
      return
    }
    if ('roomId' in res && res.roomId) {
      router.push(`/community/${res.roomId}`)
    }
  }

  return (
    <div className="border border-border rounded-xl p-5 space-y-4 bg-card">
      <div className="flex items-start gap-3">
        {host.avatar_url ? (
          <Image
            src={host.avatar_url}
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
            <UserIcon className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Your host</p>
          {host.username ? (
            <Link
              href={`/profile/${host.username}`}
              className="font-bold text-foreground hover:text-primary transition-colors"
            >
              {displayName}
            </Link>
          ) : (
            <p className="font-bold text-foreground">{displayName}</p>
          )}
          {host.phone_number && (
            <p className="text-sm text-muted-foreground mt-0.5">{host.phone_number}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {telHref ? (
          <Button asChild variant="outline" className="w-full">
            <a href={telHref}>
              <Phone className="h-4 w-4 mr-2" />
              Call host
            </a>
          </Button>
        ) : (
          <Button variant="outline" disabled className="w-full">
            <Phone className="h-4 w-4 mr-2" />
            Phone unavailable
          </Button>
        )}
        <Button
          type="button"
          onClick={handleMessageHost}
          disabled={openingChat}
          className="w-full"
        >
          <MessageCircle className="h-4 w-4 mr-2" />
          {openingChat ? 'Opening chat…' : 'Message host'}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Shared with you for this booking. Please be respectful of the host&apos;s time.
      </p>
    </div>
  )
}
