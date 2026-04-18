'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Save, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { RefundTiersEditor } from '@/components/admin/RefundTiersEditor'
import {
  parseRefundTiersJson,
  validateRefundTiers,
  defaultHostRefundTiers,
  defaultUnsoloRefundTiers,
} from '@/lib/refund-tiers'

interface Setting {
  key: string
  value: string
  description: string | null
}

const SETTING_LABELS: Record<
  string,
  { label: string; type: 'number' | 'text' | 'json' | 'refund_tiers' }
> = {
  host_max_group_size: { label: 'Max group size (hosts)', type: 'number' },
  platform_fee_percent: { label: 'Platform fee %', type: 'number' },
  join_payment_deadline_hours: { label: 'Payment deadline (hours)', type: 'number' },
  refund_tiers_unsolo: {
    label: 'Refund tiers — UnSOLO trips',
    type: 'refund_tiers',
  },
  refund_tiers_host: {
    label: 'Refund tiers — Community / host trips',
    type: 'refund_tiers',
  },
}

function refundSettingDescription(key: string, fallback: string | null): string | null {
  if (key === 'refund_tiers_host') {
    return 'Used when an admin reviews cancellations for community and host-led trips. Platform fee rules still apply.'
  }
  if (key === 'refund_tiers_unsolo') {
    return 'Used for UnSOLO curated packages: refund percentage by how many days remain before departure.'
  }
  return fallback
}

export default function SettingsClient({ settings: initialSettings }: { settings: Setting[] }) {
  const [settings, setSettings] = useState<Record<string, string>>(
    Object.fromEntries(initialSettings.map(s => [s.key, s.value]))
  )
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      for (const [key, value] of Object.entries(settings)) {
        if (key === 'refund_tiers_unsolo' || key === 'refund_tiers_host') {
          const defaults =
            key === 'refund_tiers_host' ? defaultHostRefundTiers() : defaultUnsoloRefundTiers()
          const tiers = parseRefundTiersJson(value, defaults)
          const check = validateRefundTiers(tiers)
          if (!check.ok) {
            toast.error(check.message)
            return
          }
        }
      }

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
    <div className="space-y-8 max-w-4xl">
      {initialSettings.map(s => {
        const config = SETTING_LABELS[s.key] || { label: s.key, type: 'text' as const }
        return (
          <div key={s.key} className="space-y-2">
            {config.type !== 'refund_tiers' && (
              <>
                <label className="text-sm font-medium flex items-center gap-2">
                  <Settings className="h-3.5 w-3.5 text-primary" />
                  {config.label}
                </label>
                {s.description && (
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                )}
              </>
            )}
            {config.type === 'refund_tiers' ? (
              <RefundTiersEditor
                value={settings[s.key] || ''}
                onChange={(v) => setSettings((prev) => ({ ...prev, [s.key]: v }))}
                defaults={
                  s.key === 'refund_tiers_host'
                    ? defaultHostRefundTiers()
                    : defaultUnsoloRefundTiers()
                }
                title={config.label}
                description={refundSettingDescription(s.key, s.description)}
              />
            ) : config.type === 'json' ? (
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

      <Button
        onClick={handleSave}
        disabled={isPending}
        className="bg-primary text-primary-foreground font-bold gap-2"
      >
        <Save className="h-4 w-4" />
        {isPending ? 'Saving...' : 'Save settings'}
      </Button>
    </div>
  )
}
