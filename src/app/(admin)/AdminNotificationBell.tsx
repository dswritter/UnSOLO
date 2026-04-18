'use client'

import { NotificationBell } from '@/components/layout/NotificationBell'

export function AdminNotificationBell({ userId }: { userId: string }) {
  return <NotificationBell userId={userId} placement="above" />
}
