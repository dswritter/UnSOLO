import { normalizeRoomId } from '@/lib/chat/chatQueryKeys'

const LAST_ROOM_KEY = 'unsolo:last-tribe-room-id'
const MESSAGES_PREFIX = 'unsolo:tribe-messages:'
const CACHE_VERSION = 1
const MAX_CACHED_MESSAGES = 100

function isBrowser() {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined'
}

export function getLastTribeRoomId(): string | null {
  if (!isBrowser()) return null
  try {
    const v = localStorage.getItem(LAST_ROOM_KEY)
    if (!v || !/^[0-9a-f-]{36}$/i.test(v.trim())) return null
    return v.trim()
  } catch {
    return null
  }
}

export function setLastTribeRoomId(roomId: string) {
  if (!isBrowser()) return
  try {
    if (/^[0-9a-f-]{36}$/i.test(roomId)) localStorage.setItem(LAST_ROOM_KEY, roomId)
  } catch {
    /* quota */
  }
}

type CachedMessagesPayload = {
  v: number
  savedAt: number
  messages: unknown[]
}

function msgKey(roomId: string) {
  return MESSAGES_PREFIX + normalizeRoomId(roomId)
}

export function getCachedMessagesJson(roomId: string): string | null {
  if (!isBrowser()) return null
  try {
    return sessionStorage.getItem(msgKey(roomId))
  } catch {
    return null
  }
}

export function setCachedMessagesJson(roomId: string, json: string) {
  if (!isBrowser()) return
  try {
    sessionStorage.setItem(msgKey(roomId), json)
  } catch {
    try {
      sessionStorage.removeItem(msgKey(roomId))
    } catch {
      /* ignore */
    }
  }
}

/** Safe parse for hydrating React Query / UI. */
export function parseCachedMessagesPayload(raw: string | null): CachedMessagesPayload | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as CachedMessagesPayload
    if (o.v !== CACHE_VERSION || !Array.isArray(o.messages)) return null
    if (Date.now() - o.savedAt > 1000 * 60 * 60 * 24 * 7) return null
    return o
  } catch {
    return null
  }
}

export function buildMessagesCachePayload(messages: Array<Record<string, unknown>>): string {
  const slice = messages.slice(-MAX_CACHED_MESSAGES)
  const payload: CachedMessagesPayload = {
    v: CACHE_VERSION,
    savedAt: Date.now(),
    messages: slice,
  }
  return JSON.stringify(payload)
}
