import { getRelatedServicesForPackage } from '@/actions/service-listing-discovery'
import { ServiceCarousel } from './ServiceCarousel'
import type { ServiceListing } from '@/types'

interface RelatedServicesSectionProps {
  packageId: string
  destinationId: string
  destinationName: string
}

export async function RelatedServicesSection({
  packageId,
  destinationId,
  destinationName,
}: RelatedServicesSectionProps) {
  try {
    const relatedData = await getRelatedServicesForPackage(packageId, destinationId)
    const { curated, nearbyAuto, hasCuratedLinks } = relatedData

    // Separate by type
    const activities = [...curated, ...nearbyAuto].filter((s) => s.type === 'activities')
    const stays = [...curated, ...nearbyAuto].filter((s) => s.type === 'stays')

    // Nothing to show
    if (activities.length === 0 && stays.length === 0) {
      return null
    }

    // Determine section title
    const sectionTitle = hasCuratedLinks
      ? 'Recommended for this trip'
      : `Near ${destinationName}`

    return (
      <div className="space-y-6">
        {/* Header with section title */}
        <div>
          <h2 className="text-xl font-bold">{sectionTitle}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {hasCuratedLinks
              ? 'Hand-picked experiences to complement your trip'
              : `Discover amazing ${destinationName} experiences`}
          </p>
        </div>

        {/* Activities Carousel */}
        {activities.length > 0 && (
          <ServiceCarousel
            title="Activities"
            listings={activities as ServiceListing[]}
            type="activities"
          />
        )}

        {/* Stays Carousel */}
        {stays.length > 0 && (
          <ServiceCarousel
            title="Stays"
            listings={stays as ServiceListing[]}
            type="stays"
          />
        )}
      </div>
    )
  } catch (error) {
    console.error('Error fetching related services:', error)
    return null
  }
}
