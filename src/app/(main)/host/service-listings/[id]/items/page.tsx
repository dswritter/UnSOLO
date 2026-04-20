import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function LegacyItemsRedirect({ params }: PageProps) {
  const { id } = await params
  redirect(`/host/service-listings/${id}/edit?tab=items`)
}
