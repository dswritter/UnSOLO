import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { User as UserIcon } from 'lucide-react'
import { ProfileV2Shell } from '@/components/profile/ProfileV2Shell'
import { loadPublicListingHost } from '@/lib/profile/public-host-profile'
import { hostProfileHref } from '@/lib/profile/host-profile'

export default async function HostProfilePage({
  params,
}: {
  params: Promise<{ kind: string; listingId: string }>
}) {
  const { kind, listingId } = await params
  if (kind !== 'trip' && kind !== 'service') notFound()
  const host = await loadPublicListingHost(kind, listingId)
  if (!host) notFound()
  if (host.linked) redirect(hostProfileHref(host)!)

  return (
    <ProfileV2Shell>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <section className="rounded-2xl border border-border bg-card p-6">
          <UserIcon className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-2xl font-bold text-foreground">{host.name}</h1>
          <p className="mt-1 text-sm font-semibold text-primary">Host</p>
          <p className="mt-4 text-sm text-muted-foreground">
            This listing was added by the UnSOLO team on behalf of the host.
            Messaging will be available once the host links their account.
          </p>
        </section>
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-3 text-lg font-bold text-foreground">Hosted listing</h2>
          <Link href={host.listing.href} className="font-medium text-primary hover:underline">
            {host.listing.title}
          </Link>
          <p className="mt-4 text-sm text-muted-foreground">
            The host&apos;s contact number will be shared after your booking is completed.
          </p>
        </section>
      </div>
    </ProfileV2Shell>
  )
}
