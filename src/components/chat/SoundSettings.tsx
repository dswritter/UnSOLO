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

  function toggle(key: 'muteDMs' | 'muteCommunity' | 'muteTrips') {
    const updated = { ...settings, [key]: !settings[key] }
    // Auto-derive soundEnabled: if all muted, sound is off
    updated.soundEnabled = !(updated.muteDMs && updated.muteCommunity && updated.muteTrips)
    setSettings(updated)
    saveNotificationSettings(updated)
  }

  const allMuted = settings.muteDMs && settings.muteCommunity && settings.muteTrips

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
        title="Sound settings"
      >
        {allMuted ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4" />}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-xl p-3 w-52">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold">Notification Sounds</span>
              <button onClick={() => setOpen(false)}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
            </div>
            <div className="space-y-2.5">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-xs group-hover:text-foreground transition-colors">DMs</span>
                <div className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer ${settings.muteDMs ? 'bg-red-500/30' : 'bg-green-500/30'}`}
                  onClick={(e) => { e.preventDefault(); toggle('muteDMs') }}>
                  <div className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${settings.muteDMs ? 'right-0.5 bg-red-400' : 'left-0.5 bg-green-400'}`} />
                </div>
              </label>
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-xs group-hover:text-foreground transition-colors">Community</span>
                <div className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer ${settings.muteCommunity ? 'bg-red-500/30' : 'bg-green-500/30'}`}
                  onClick={(e) => { e.preventDefault(); toggle('muteCommunity') }}>
                  <div className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${settings.muteCommunity ? 'right-0.5 bg-red-400' : 'left-0.5 bg-green-400'}`} />
                </div>
              </label>
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-xs group-hover:text-foreground transition-colors">Trips</span>
                <div className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer ${settings.muteTrips ? 'bg-red-500/30' : 'bg-green-500/30'}`}
                  onClick={(e) => { e.preventDefault(); toggle('muteTrips') }}>
                  <div className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${settings.muteTrips ? 'right-0.5 bg-red-400' : 'left-0.5 bg-green-400'}`} />
                </div>
              </label>
            </div>
            {allMuted && (
              <p className="text-[10px] text-red-400 mt-2">All sounds muted</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
