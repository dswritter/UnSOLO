'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Save, Settings, Share2, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { RefundTiersEditor } from '@/components/admin/RefundTiersEditor'
import {
  parseRefundTiersJson,
  validateRefundTiers,
  defaultHostRefundTiers,
  defaultUnsoloRefundTiers,
} from '@/lib/refund-tiers'
import { cn } from '@/lib/utils'

interface Setting {
  key: string
  value: string
  description: string | null
}

const SETTING_LABELS: Record<
  string,
  { label: string; type: 'number' | 'text' | 'textarea' | 'json' | 'refund_tiers' }
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
  share_poster_share_title: { label: 'Native share title', type: 'text' },
  share_poster_share_text: { label: 'Native share message', type: 'textarea' },
  share_poster_footer_tagline: {
    label: 'Share poster footer tagline',
    type: 'textarea',
  },
}

const SHARE_POSTER_ORDER = [
  'share_poster_share_title',
  'share_poster_share_text',
  'share_poster_footer_tagline',
] as const

const SHARE_POSTER_KEYS = new Set<string>(SHARE_POSTER_ORDER)
const REFUND_KEYS = new Set(['refund_tiers_unsolo', 'refund_tiers_host'])

/** Defaults when rows are missing (e.g. before migration). */
const SHARE_POSTER_DEFAULTS: Record<(typeof SHARE_POSTER_ORDER)[number], string> = {
  share_poster_share_title: '{displayName} on UnSOLO',
  share_poster_share_text: 'See my travel story on UnSOLO — {profileUrl}',
  share_poster_footer_tagline: 'Book treks, find your tribe, share the stoke.',
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

function CompactSettingRow({
  label,
  description,
  children,
}: {
  label: string
  description: string | null
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:gap-4 sm:justify-between border-b border-border/50 last:border-0">
      <div className="min-w-0 flex-1 sm:max-w-[min(56%,22rem)]">
        <div className="text-sm font-medium flex items-center gap-2">
          <Settings className="h-3.5 w-3.5 text-primary shrink-0" />
          {label}
        </div>
        {description ? (
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
        ) : null}
      </div>
      <div className="w-full sm:w-auto sm:shrink-0 sm:max-w-[13.5rem]">{children}</div>
    </div>
  )
}

function buildInitialSettingsMap(initialSettings: Setting[]): Record<string, string> {
  const m = Object.fromEntries(initialSettings.map((s) => [s.key, s.value]))
  for (const k of SHARE_POSTER_ORDER) {
    if (m[k] === undefined) {
      m[k] = SHARE_POSTER_DEFAULTS[k]
    }
  }
  return m
}

export default function SettingsClient({ settings: initialSettings }: { settings: Setting[] }) {
  const [settings, setSettings] = useState<Record<string, string>>(() =>
    buildInitialSettingsMap(initialSettings)
  )
  const [refundUnsoloOpen, setRefundUnsoloOpen] = useState(false)
  const [refundHostOpen, setRefundHostOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const generalSettings = initialSettings.filter(
    (s) => !SHARE_POSTER_KEYS.has(s.key) && !REFUND_KEYS.has(s.key)
  )
  const refundSettings = initialSettings
    .filter((s) => REFUND_KEYS.has(s.key))
    .sort((a, b) => {
      if (a.key === 'refund_tiers_unsolo') return -1
      if (b.key === 'refund_tiers_unsolo') return 1
      return a.key.localeCompare(b.key)
    })

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
    <div className="space-y-6 max-w-3xl">
      <div className="rounded-xl border border-border/80 bg-card/30 px-4 py-1">
        {generalSettings.map((s) => {
          const config = SETTING_LABELS[s.key] || { label: s.key, type: 'text' as const }
          if (config.type === 'json') {
            return (
              <div key={s.key} className="py-3 space-y-2 border-b border-border/50 last:border-0">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Settings className="h-3.5 w-3.5 text-primary" />
                  {config.label}
                </label>
                {s.description ? (
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                ) : null}
                <Textarea
                  value={settings[s.key] || ''}
                  onChange={(e) => setSettings((prev) => ({ ...prev, [s.key]: e.target.value }))}
                  className="bg-secondary border-border max-w-xl min-h-[140px] font-mono text-xs"
                  spellCheck={false}
                />
              </div>
            )
          }
          return (
            <CompactSettingRow key={s.key} label={config.label} description={s.description}>
              {config.type === 'textarea' ? (
                <Textarea
                  value={settings[s.key] || ''}
                  onChange={(e) => setSettings((prev) => ({ ...prev, [s.key]: e.target.value }))}
                  className="bg-secondary border-border min-h-[72px] text-sm"
                  spellCheck={true}
                />
              ) : (
                <Input
                  type={config.type === 'number' ? 'number' : 'text'}
                  value={settings[s.key] || ''}
                  onChange={(e) => setSettings((prev) => ({ ...prev, [s.key]: e.target.value }))}
                  className="bg-secondary border-border h-9"
                />
              )}
            </CompactSettingRow>
          )
        })}
      </div>

      <div className="rounded-xl border border-border bg-card/40 p-4 space-y-4 max-w-3xl">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Share2 className="h-4 w-4 text-primary shrink-0" />
          Profile share poster
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Native share sheet uses the title and message below. Placeholders:{' '}
          <code className="text-[11px] bg-muted/80 px-1 rounded">{'{displayName}'}</code>,{' '}
          <code className="text-[11px] bg-muted/80 px-1 rounded">{'{profileUrl}'}</code>. Footer
          tagline is shown on the poster image only.
        </p>
        <div className="space-y-3">
          {SHARE_POSTER_ORDER.map((key) => {
            const row = initialSettings.find((x) => x.key === key)
            const config = SETTING_LABELS[key]!
            const description = row?.description ?? null
            return (
              <div key={key} className="space-y-1.5">
                <label className="text-sm font-medium">{config.label}</label>
                {description ? (
                  <p className="text-xs text-muted-foreground leading-snug">{description}</p>
                ) : null}
                {config.type === 'textarea' ? (
                  <Textarea
                    value={settings[key] || ''}
                    onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="bg-secondary border-border min-h-[72px] text-sm max-w-xl"
                    spellCheck={true}
                  />
                ) : (
                  <Input
                    value={settings[key] || ''}
                    onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="bg-secondary border-border h-9 max-w-xl"
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-3 max-w-3xl">
        {refundSettings.map((s) => {
          const config = SETTING_LABELS[s.key]!
          const open = s.key === 'refund_tiers_unsolo' ? refundUnsoloOpen : refundHostOpen
          const setOpen = s.key === 'refund_tiers_unsolo' ? setRefundUnsoloOpen : setRefundHostOpen
          return (
            <div
              key={s.key}
              className="rounded-xl border border-border bg-card/30 overflow-hidden max-w-3xl"
            >
              <button
                type="button"
                className="relative flex w-full items-start gap-2 pl-4 pr-10 py-3 text-left hover:bg-card/60 transition-colors"
                onClick={() => setOpen((v) => !v)}
              >
                <Settings className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold leading-tight">{config.label}</div>
                  {refundSettingDescription(s.key, s.description) ? (
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed pr-1">
                      {refundSettingDescription(s.key, s.description)}
                    </p>
                  ) : null}
                </div>
                <ChevronRight
                  className={cn(
                    'absolute right-3 top-3 h-3.5 w-3.5 text-muted-foreground transition-transform',
                    open && 'rotate-90'
                  )}
                  aria-hidden
                />
              </button>
              {open ? (
                <div className="border-t border-border px-4 py-4 bg-card/20">
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
                    hideOuterTitle
                  />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

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
