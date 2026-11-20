export type MessagingBasePath = '/community'

/**
 * Chat lives at /community (Messages). /tribe is the community feed.
 * Kept async + typed so existing callers don't change.
 */
export async function getMessagingBasePath(): Promise<MessagingBasePath> {
  return '/community'
}
