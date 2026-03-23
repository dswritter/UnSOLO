import { getAdminDashboardStats } from '@/actions/admin'
import { formatPrice } from '@/types'
import { Users, CreditCard, Clock, UserCheck, IndianRupee, BookOpen } from 'lucide-react'

export default async function AdminDashboardPage() {
  const stats = await getAdminDashboardStats()

  const cards = [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'text-blue-400' },
    { label: 'Total Bookings', value: stats.totalBookings, icon: BookOpen, color: 'text-purple-400' },
    { label: 'Confirmed Bookings', value: stats.confirmedBookings, icon: CreditCard, color: 'text-green-400' },
    { label: 'Pending Requests', value: stats.pendingRequests, icon: Clock, color: 'text-yellow-400' },
    { label: 'Team Members', value: stats.teamCount, icon: UserCheck, color: 'text-cyan-400' },
    { label: 'Total Revenue', value: formatPrice(stats.totalRevenue), icon: IndianRupee, color: 'text-primary' },
  ]

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-border bg-card/50 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg bg-secondary ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-sm text-muted-foreground">{label}</span>
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <a
          href="/admin/bookings"
          className="rounded-xl border border-border bg-card/50 p-5 hover:border-zinc-600 transition-colors"
        >
          <h3 className="font-semibold mb-1">Manage Bookings →</h3>
          <p className="text-sm text-muted-foreground">View all bookings, assign POC, send confirmations</p>
        </a>
        <a
          href="/admin/requests"
          className="rounded-xl border border-border bg-card/50 p-5 hover:border-zinc-600 transition-colors"
        >
          <h3 className="font-semibold mb-1">Custom Requests →</h3>
          <p className="text-sm text-muted-foreground">Review and respond to custom date requests</p>
        </a>
        <a
          href="/admin/packages"
          className="rounded-xl border border-border bg-card/50 p-5 hover:border-zinc-600 transition-colors"
        >
          <h3 className="font-semibold mb-1">Manage Packages →</h3>
          <p className="text-sm text-muted-foreground">Create, edit, activate/deactivate travel packages & destinations</p>
        </a>
        <a
          href="/admin/team"
          className="rounded-xl border border-border bg-card/50 p-5 hover:border-zinc-600 transition-colors"
        >
          <h3 className="font-semibold mb-1">Team Management →</h3>
          <p className="text-sm text-muted-foreground">Add social media managers, field persons, chat responders</p>
        </a>
      </div>
    </div>
  )
}
