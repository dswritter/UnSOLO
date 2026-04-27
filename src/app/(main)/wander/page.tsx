export const revalidate = 300

import { WanderLandingPage } from '@/components/wander/WanderLandingPage'

export default function WanderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  return <WanderLandingPage searchParams={searchParams} searchBasePath="/wander" />
}
