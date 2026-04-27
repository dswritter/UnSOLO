import { headers } from 'next/headers'

export type MessagingBasePath = '/tribe' | '/community'

/**
 * After `/community` → `/tribe` rewrites, chat URLs must use the browser path
 * (`/community/...`) so links and redirects stay on community.
 */
export async function getMessagingBasePath(): Promise<MessagingBasePath> {
  const h = await headers()
  const p = h.get('x-unsolo-pathname') ?? ''
  return p.startsWith('/community') ? '/community' : '/tribe'
}
