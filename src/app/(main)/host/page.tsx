import { redirect } from 'next/navigation'
import Link from 'next/link'
import { checkIsHost, getHostDashboardStats, getMyHostedTrips } from '@/actions/hosting'
import { formatPrice, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { HostTripsList } from './HostTripsList'
import {
  Plus,
  MapPin,
  Calendar,
  Users,
  IndianRupee,
  TrendingUp,
  Clock,
} from 'lucide-react'

function ModerationBadge({ status }: { status: string }) {
  switch (status) {
    case 'approved':
      return <Badge className="bg-green-900/50 text-green-300 border border-green-700 text-xs">Approved</Badge>
    case 'pending':
      return <Badge className="bg-yellow-900/50 text-yellow-300 border border-yellow-700 text-xs">Pending Review</Badge>
    case 'rejected':
      return <Badge className="bg-red-900/50 text-red-300 border border-red-700 text-xs">Rejected</Badge>
    default:
      return <Badge className="bg-zinc-700 text-zinc-200 text-xs">{status}</Badge>
  }
}

export default async function HostDashboardPage() {
  const hostStatus = await checkIsHost()

  if (!hostStatus.authenticated) redirect('/login')
  if (!hostStatus.isHost) redirect('/host/verify')

  const [stats, trips] = await Promise.all([
    getHostDashboardStats(),
    getMyHostedTrips(),
  ])

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-black">
              Host <span className="text-primary">Dashboard</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Host your own trips or experiences and invite travelers to join
            </p>
          </div>
          <Button asChild className="bg-primary text-primary-foreground font-bold gap-2" size="sm">
            <Link href="/host/create">
              <Plus className="h-4 w-4" />
              Create New Trip
            </Link>
          </Button>
        </div>

        {/* Compact Stats Row */}
        <HostTripsList
          stats={stats}
          trips={trips as { id: string; title: string; slug: string; is_active: boolean; moderation_status: string | null; price_paise: number; duration_days: number; departure_dates: string[] | null; images: string[] | null; max_group_size: number; pending_requests: number; approved_requests: number; destination: { name: string; state: string } | null }[]}
        />
      </div>
    </div>
  )
}
