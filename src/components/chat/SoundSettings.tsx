'use client'

import { useState, useSyncExternalStore } from 'react'
import { Volume2, VolumeX, X } from 'lucide-react'
import { getNotificationSettings, saveNotificationSettings, type NotificationSettings } from '@/lib/notifications/soundController'

function subscribeSettings(listener: () => void) {
  window.addEventListener('storage', listener)
  window.addEventListener('unsolo:notification-settings', listener)
  return () => {
    window.removeEventListener('storage', listener)
    window.removeEventListener('unsolo:notification-settings', listener)
  }
}
const serverSettings = JSON.stringify({ soundEnabled: true, muteDMs: false, muteCommunity: false, muteTrips: false })
const settingsSnapshot = () => JSON.stringify(getNotificationSettings())

export function SoundSettingsButton() {
  const [open, setOpen] = useState(false)
  const snapshot = useSyncExternalStore(subscribeSettings, settingsSnapshot, () => serverSettings)
  const settings: NotificationSettings = JSON.parse(snapshot)

  function toggle(key: 'muteDMs' | 'muteCommunity' | 'muteTrips') {
    const updated = { ...settings, [key]: settings.soundEnabled && !settings[key] }
    // Auto-derive soundEnabled: if all muted, sound is off
    updated.soundEnabled = !(updated.muteDMs && updated.muteCommunity && updated.muteTrips)
    saveNotificationSettings(updated)
  }

  const allMuted = !settings.soundEnabled || (settings.muteDMs && settings.muteCommunity && settings.muteTrips)

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
        title="Sound settings"
        aria-label="Notification sound settings"
        aria-expanded={open}
      >
        {allMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-xl p-3 w-52">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold">Notification Sounds</span>
              <button aria-label="Close sound settings" onClick={() => setOpen(false)}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
            </div>
            <div className="space-y-2.5">
              {([
                ['muteDMs', 'DMs'],
                ['muteCommunity', 'Community'],
                ['muteTrips', 'Trips'],
              ] as const).map(([key, label]) => {
                const enabled = settings.soundEnabled && !settings[key]
                return (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-xs">{label}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-label={`${label} notification sounds`}
                      aria-checked={enabled}
                      onClick={() => toggle(key)}
                      className="flex items-center gap-2 rounded-md py-1 focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <span className="text-[11px] font-medium text-muted-foreground">{enabled ? 'On' : 'Off'}</span>
                      <span className={`relative h-5 w-9 rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                        <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
            {allMuted && (
              <p className="text-[10px] text-muted-foreground mt-2">All sounds muted</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
