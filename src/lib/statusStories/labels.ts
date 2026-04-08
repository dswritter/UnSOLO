import type { StatusStoryAudienceMode } from '@/lib/statusStories/audience'

export function audiencePillLabel(
  mode: StatusStoryAudienceMode,
  opts: { excludeCount: number; includeUserCount: number; roomCount: number },
): string {
  switch (mode) {
    case 'all':
      return opts.excludeCount > 0 ? `Everyone · ${opts.excludeCount} hidden` : 'Everyone'
    case 'followers':
      return 'Followers only'
    case 'following':
      return 'Following only'
    case 'users':
      return opts.includeUserCount > 0 ? `${opts.includeUserCount} people` : 'Specific people'
    case 'communities':
      return opts.roomCount > 0 ? `${opts.roomCount} communities` : 'Communities'
    default:
      return 'Everyone'
  }
}
