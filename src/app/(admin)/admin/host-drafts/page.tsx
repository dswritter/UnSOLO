import { getStaffListingDrafts } from '@/actions/listing-drafts'
import { timeAgo } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function HostDraftsPage() {
  const res = await getStaffListingDrafts()
  const drafts = 'drafts' in res ? res.drafts : []
  const err = 'error' in res ? res.error : null

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Listings in progress</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Hosts part-way through creating a listing (saved as they move between steps). Reach out and help them finish.
      </p>

      {err && <p className="text-sm text-red-400">{err}</p>}
      {!err && drafts.length === 0 && (
        <p className="text-sm text-muted-foreground">No drafts in progress right now.</p>
      )}

      <div className="space-y-2">
        {drafts.map((d) => (
          <a key={d.id} href={`/admin/host-drafts/${d.id}`} className="rounded-lg border border-border bg-card p-3 flex flex-wrap items-center justify-between gap-2 hover:border-primary/40 transition-colors">
            <div className="min-w-0">
              <div className="font-medium truncate">
                {d.title || 'Untitled draft'}{' '}
                <span className="text-xs font-normal text-muted-foreground">· {d.kind === 'trip' ? 'Trip' : 'Service listing'}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {(d.host?.full_name || d.host?.username || 'Host')}
                {d.host?.username ? ` · @${d.host.username}` : ''}
                {d.destination_label ? ` · ${d.destination_label}` : ''}
                {' · '}step {d.step + 1}
                {' · '}updated {timeAgo(d.updated_at)}
              </div>
            </div>
            <span className="text-xs text-primary shrink-0">Edit →</span>
          </a>
        ))}
      </div>
    </div>
  )
}
