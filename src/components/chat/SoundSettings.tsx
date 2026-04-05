'use client'

import { useState, useEffect } from 'react'
import { Volume2, VolumeX, X } from 'lucide-react'
import { getNotificationSettings, saveNotificationSettings, type NotificationSettings } from '@/lib/notifications/soundController'

export function SoundSettingsButton() {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<NotificationSettings>({
    soundEnabled: true,
    muteDMs: false,
    muteCommunity: false,
    muteTrips: false,
  })

  useEffect(() => {
    setSettings(getNotificationSettings())
  }, [])

  function toggle(key: keyof NotificationSettings) {
    const updated = { ...settings, [key]: !settings[key] }
    setSettings(updated)
    saveNotificationSettings(updated)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
        title="Sound settings"
      >
        {settings.soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-red-400" />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-xl p-3 w-56">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold">Notification Sounds</span>
              <button onClick={() => setOpen(false)}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
            </div>

            <div className="space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs">Sound enabled</span>
                <input type="checkbox" checked={settings.soundEnabled} onChange={() => toggle('soundEnabled')} className="accent-primary" />
              </label>
              <div className="border-t border-border pt-2 space-y-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs text-muted-foreground">Mute DMs</span>
                  <input type="checkbox" checked={settings.muteDMs} onChange={() => toggle('muteDMs')} className="accent-primary" />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs text-muted-foreground">Mute Community</span>
                  <input type="checkbox" checked={settings.muteCommunity} onChange={() => toggle('muteCommunity')} className="accent-primary" />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs text-muted-foreground">Mute Trips</span>
                  <input type="checkbox" checked={settings.muteTrips} onChange={() => toggle('muteTrips')} className="accent-primary" />
                </label>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
