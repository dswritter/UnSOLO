import type { UserRole } from '@/types'

const STAFF: ReadonlySet<UserRole> = new Set([
  'admin',
  'social_media_manager',
  'field_person',
  'chat_responder',
])

export function isCommunityStaffRole(role: UserRole | string | null | undefined): boolean {
  if (!role || role === 'user') return false
  return STAFF.has(role as UserRole)
}
