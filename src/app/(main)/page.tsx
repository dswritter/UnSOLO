export const revalidate = 300

import { WanderThemeShell } from '@/components/wander/WanderThemeShell'
import { WanderLandingPage } from '@/components/wander/WanderLandingPage'

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  return (
    <WanderThemeShell>
      <WanderLandingPage searchParams={searchParams} searchBasePath="/" />
    </WanderThemeShell>
  )
}
