export type StatusStoryAudienceMode = 'all' | 'followers' | 'following' | 'users' | 'communities'

export type StatusStoryAudience = {
  mode: StatusStoryAudienceMode
  /** When mode is "all": hide from these user IDs */
  exclude_user_ids?: string[]
  /** When mode is "users" */
  include_user_ids?: string[]
  /** When mode is "communities": general chat room IDs */
  include_room_ids?: string[]
}

export function serializeAudience(a: StatusStoryAudience): Record<string, unknown> {
  const base: Record<string, unknown> = { mode: a.mode }
  if (a.exclude_user_ids?.length) base.exclude_user_ids = a.exclude_user_ids
  if (a.include_user_ids?.length) base.include_user_ids = a.include_user_ids
  if (a.include_room_ids?.length) base.include_room_ids = a.include_room_ids
  return base
}
