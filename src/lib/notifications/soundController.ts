/**
 * UNSOLO Chat Notification Sound Controller
 *
 * Central, modular controller for chat notification sounds.
 * Handles cooldown, burst control, muting, visibility, and typing state.
 */

// ── Settings (persisted in localStorage) ─────────────────────

export interface NotificationSettings {
  soundEnabled: boolean
  muteDMs: boolean
  muteCommunity: boolean
  muteTrips: boolean
}

const SETTINGS_KEY = 'unsolo-notification-settings'
const COOLDOWN_MS = 2000

const DEFAULT_SETTINGS: NotificationSettings = {
  soundEnabled: true,
  muteDMs: false,
  muteCommunity: false,
  muteTrips: false,
}

export function getNotificationSettings(): NotificationSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const stored = localStorage.getItem(SETTINGS_KEY)
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
  } catch {}
  return DEFAULT_SETTINGS
}

export function saveNotificationSettings(settings: Partial<NotificationSettings>) {
  if (typeof window === 'undefined') return
  const current = getNotificationSettings()
  const updated = { ...current, ...settings }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated))
}

// ── Audio Engine ─────────────────────────────────────────────

let audio: HTMLAudioElement | null = null
let lastPlayedAt = 0

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio('/sounds/notification.mp3')
    audio.preload = 'auto'
    audio.volume = 0.6
  }
  return audio
}

// Preload on first user interaction (browsers require gesture for audio)
export function preloadSound() {
  if (typeof window === 'undefined') return
  const a = ensureAudio()
  // Silent load to prime the audio context
  a.load()
}

// ── Core Play Logic ──────────────────────────────────────────

export interface PlaySoundContext {
  /** The room the message came from */
  messageRoomId: string
  /** The room the user is currently viewing (null = not in any chat) */
  activeRoomId: string | null
  /** Type of the room: 'direct' | 'trip' | 'general' */
  roomType: 'direct' | 'trip' | 'general'
  /** Current unread count for this room (before this message) */
  unreadCount: number
  /** Is the user currently typing in any input? */
  isTyping: boolean
}

/**
 * Evaluate whether to play the notification sound.
 * Returns true if sound was played, false otherwise.
 */
export function playNotificationSound(ctx: PlaySoundContext): boolean {
  const settings = getNotificationSettings()

  // 1. Sound disabled globally
  if (!settings.soundEnabled) return false

  // 2. User is viewing this exact chat
  if (ctx.activeRoomId === ctx.messageRoomId) return false

  // 3. Category is muted
  if (ctx.roomType === 'direct' && settings.muteDMs) return false
  if (ctx.roomType === 'general' && settings.muteCommunity) return false
  if (ctx.roomType === 'trip' && settings.muteTrips) return false

  // 4. Tab is hidden
  if (typeof document !== 'undefined' && document.hidden) return false

  // 5. User is typing
  if (ctx.isTyping) return false

  // 6. Already has unread messages (only first message triggers sound)
  if (ctx.unreadCount > 0) return false

  // 7. Cooldown check (burst control)
  const now = Date.now()
  if (now - lastPlayedAt < COOLDOWN_MS) return false

  // ✓ All checks passed — play sound
  lastPlayedAt = now
  const a = ensureAudio()
  a.currentTime = 0
  a.play().catch(() => {}) // Silently fail if browser blocks

  return true
}

// ── System Notification (for inactive tabs) ──────────────────

export function sendSystemNotification(title: string, body: string, icon?: string) {
  if (typeof window === 'undefined') return
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  if (!document.hidden) return // Only when tab is inactive

  try {
    new Notification(title, {
      body,
      icon: icon || '/favicon.ico',
      tag: 'unsolo-chat', // Prevents duplicate notifications
    })
  } catch {}
}
