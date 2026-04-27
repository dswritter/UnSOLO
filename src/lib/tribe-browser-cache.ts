import { normalizeRoomId } from '@/lib/chat/chatQueryKeys'
import type { Message } from '@/types'

const LAST_ROOM_KEY = 'unsolo:last-tribe-room-id'
const MESSAGES_PREFIX = 'unsolo:tribe-messages:'
/** Survives refresh, new tabs, and session restarts (best-effort). */
const MESSAGES_PERSIST_PREFIX = 'unsolo:tribe-messages-persist:'
const CACHE_VERSION = 1
const MAX_CACHED_MESSAGES = 100

function isBrowser() {
  return (
    typeof window !== 'undefined' &&
    typeof sessionStorage !== 'undefined' &&
    typeof localStorage !== 'undefined'
  )
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

function msgPersistKey(roomId: string) {
  return MESSAGES_PERSIST_PREFIX + normalizeRoomId(roomId)
}

export function getCachedMessagesJson(roomId: string): string | null {
  if (!isBrowser()) return null
  try {
    return sessionStorage.getItem(msgKey(roomId)) ?? localStorage.getItem(msgPersistKey(roomId))
  } catch {
    return null
  }
}

/** Prefer sessionStorage, then localStorage — newest valid payload wins for priming the transcript. */
export function readPrimedMessages(roomId: string): Message[] | null {
  if (!isBrowser()) return null
  try {
    const k = msgKey(roomId)
    const pk = msgPersistKey(roomId)
    const sessionRaw = sessionStorage.getItem(k)
    const localRaw = localStorage.getItem(pk)
    const pick = (a: string | null, b: string | null) => {
      const pa = parseCachedMessagesPayload(a)
      const pb = parseCachedMessagesPayload(b)
      if (pa && pb) return pa.savedAt >= pb.savedAt ? pa : pb
      return pa ?? pb
    }
    const parsed = pick(sessionRaw, localRaw)
    if (!parsed?.messages?.length) return null
    return parsed.messages as Message[]
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
  try {
    localStorage.setItem(msgPersistKey(roomId), json)
  } catch {
    try {
      localStorage.removeItem(msgPersistKey(roomId))
    } catch {
      /* quota */
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
