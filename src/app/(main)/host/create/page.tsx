import { HostTripForm } from '@/components/hosting/HostTripForm'

export default async function CreateTripPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>
}) {
  const { draft } = await searchParams
  return <HostTripForm resumeDraftId={draft} />
}
