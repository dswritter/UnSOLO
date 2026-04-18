'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Save, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Setting {
  key: string
  value: string
  description: string | null
}

const SETTING_LABELS: Record<string, { label: string; type: 'number' | 'text' | 'json' }> = {
  host_max_group_size: { label: 'Max Group Size (for hosts)', type: 'number' },
  platform_fee_percent: { label: 'Platform Fee %', type: 'number' },
  join_payment_deadline_hours: { label: 'Payment Deadline (hours)', type: 'number' },
  refund_tiers_unsolo: {
    label: 'Refund tiers — UnSOLO trips (JSON)',
    type: 'json',
  },
  refund_tiers_host: {
    label: 'Refund tiers — Community / host trips (JSON)',
    type: 'json',
  },
}

export default function SettingsClient({ settings: initialSettings }: { settings: Setting[] }) {
  const [settings, setSettings] = useState<Record<string, string>>(
    Object.fromEntries(initialSettings.map(s => [s.key, s.value]))
  )
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const supabase = createClient()
      let hasError = false
      for (const [key, value] of Object.entries(settings)) {
        const { error } = await supabase
          .from('platform_settings')
          .update({ value, updated_at: new Date().toISOString() })
          .eq('key', key)
        if (error) {
          toast.error(`Failed to save ${key}: ${error.message}`)
          hasError = true
        }
      }
      if (!hasError) toast.success('Settings saved!')
    })
  }

  return (
    <div className="space-y-6 max-w-lg">
      {initialSettings.map(s => {
        const config = SETTING_LABELS[s.key] || { label: s.key, type: 'text' }
        return (
          <div key={s.key} className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-2">
              <Settings className="h-3.5 w-3.5 text-primary" />
              {config.label}
            </label>
            {s.description && (
              <p className="text-xs text-muted-foreground">{s.description}</p>
            )}
                       {config.type === 'json' ? (
              <Textarea
                value={settings[s.key] || ''}
                onChange={(e) => setSettings((prev) => ({ ...prev, [s.key]: e.target.value }))}
                className="bg-secondary border-border max-w-xl min-h-[140px] font-mono text-xs"
                spellCheck={false}
              />
            ) : (
              <Input
                type={config.type === 'number' ? 'number' : 'text'}
                value={settings[s.key] || ''}
                onChange={(e) => setSettings((prev) => ({ ...prev, [s.key]: e.target.value }))}
                className="bg-secondary border-border max-w-xs"
              />
            )}
          </div>
        )
      })}

      <Button onClick={handleSave} disabled={isPending} className="bg-primary text-primary-foreground font-bold gap-2">
        <Save className="h-4 w-4" />
        {isPending ? 'Saving...' : 'Save Settings'}
      </Button>
    </div>
  )
}
