'use client'

import { useState, useTransition, useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'
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
  defaultStaysRefundTiers,
  defaultActivitiesRefundTiers,
  defaultRentalsRefundTiers,
} from '@/lib/refund-tiers'
import { cn } from '@/lib/utils'
import { DEFAULT_WANDER_TRUST_BADGE_TEXT } from '@/lib/wander/wander-defaults'
import { WanderHeroImageField } from './WanderHeroImageField'

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
  platform_fee_percent: { label: 'Commission % — Trips', type: 'number' },
  platform_fee_percent_stays: { label: 'Commission % — Stays', type: 'number' },
  platform_fee_percent_activities: { label: 'Commission % — Activities', type: 'number' },
  platform_fee_percent_rentals: { label: 'Commission % — Rentals', type: 'number' },
  platform_fee_percent_getting_around: { label: 'Commission % — Getting Around', type: 'number' },
  join_payment_deadline_hours: { label: 'Payment deadline (hours)', type: 'number' },
  refund_tiers_unsolo: {
    label: 'Refund tiers — UnSOLO trips',
    type: 'refund_tiers',
  },
  refund_tiers_host: {
    label: 'Refund tiers — Community / host trips',
    type: 'refund_tiers',
  },
  refund_tiers_stays: {
    label: 'Refund tiers — Stays',
    type: 'refund_tiers',
  },
  refund_tiers_activities: {
    label: 'Refund tiers — Activities',
    type: 'refund_tiers',
  },
  refund_tiers_rentals: {
    label: 'Refund tiers — Rentals',
    type: 'refund_tiers',
  },
  share_poster_share_title: { label: 'Native share title', type: 'text' },
  share_poster_share_text: { label: 'Native share message', type: 'textarea' },
  share_poster_footer_tagline: {
    label: 'Share poster footer tagline',
    type: 'textarea',
  },
  support_whatsapp_number: { label: 'Default WhatsApp number', type: 'text' },
  wander_hero_image_url: {
    label: 'Wander page — hero image (URL or upload)',
    type: 'text',
  },
  wander_trust_badge_text: {
    label: 'Wander page — top badge (hero, left)',
    type: 'textarea',
  },
}

const SHARE_POSTER_ORDER = [
  'share_poster_share_title',
  'share_poster_share_text',
  'share_poster_footer_tagline',
] as const

const SHARE_POSTER_KEYS = new Set<string>(SHARE_POSTER_ORDER)
const REFUND_KEYS = new Set([
  'refund_tiers_unsolo',
  'refund_tiers_host',
  'refund_tiers_stays',
  'refund_tiers_activities',
  'refund_tiers_rentals',
])

const GENERAL_SETTING_KEYS = Object.keys(SETTING_LABELS).filter(
  (k) => !SHARE_POSTER_KEYS.has(k) && !REFUND_KEYS.has(k),
)

/** Defaults when rows are missing (e.g. before migration). */
const SHARE_POSTER_DEFAULTS: Record<(typeof SHARE_POSTER_ORDER)[number], string> = {
  share_poster_share_title: '{displayName} on UnSOLO',
  share_poster_share_text: 'See my travel story on UnSOLO — {profileUrl}',
  share_poster_footer_tagline: 'Book treks, find your tribe, share the stoke.',
}

function refundSettingDescription(key: string, fallback: string | null): string | null {
  switch (key) {
    case 'refund_tiers_host':
      return 'Community / host-led trips. Host and platform absorb the refund proportionally (fair-split).'
    case 'refund_tiers_unsolo':
      return 'UnSOLO curated packages: refund percentage by how many days remain before departure.'
    case 'refund_tiers_stays':
      return 'Overnight stays — homestays, cabins, hotels. Hours shown relative to check-in.'
    case 'refund_tiers_activities':
      return 'Day experiences — tours, workshops, classes. Hours shown relative to start time.'
    case 'refund_tiers_rentals':
      return 'Rentals — bikes, scooters, gear, vehicles. Sub-day precision supported (12h granularity).'
    default:
      return fallback
  }
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
  for (const k of GENERAL_SETTING_KEYS) {
    if (m[k] === undefined) {
      m[k] = ''
    }
  }
  return m
}

function syntheticGeneralRow(key: string): Setting {
  if (key === 'wander_hero_image_url') {
    return {
      key,
      value: '',
      description:
        'Paste an HTTPS image URL, upload from your device (max 5MB), or clear to use the built-in default.',
    }
  }
  if (key === 'wander_trust_badge_text') {
    return {
      key,
      value: '',
      description: `Text in the top-left /wander pill. Leave empty for the default: “${DEFAULT_WANDER_TRUST_BADGE_TEXT}”.`,
    }
  }
  return { key, value: '', description: null }
}

const SHARE_PLACEHOLDERS = [
  {
    token: '{displayName}',
    hint: 'The member’s display name when someone shares their poster.',
  },
  {
    token: '{profileUrl}',
    hint: 'Full profile URL for the person being shared (filled in at share time).',
  },
] as const

function insertTokenIntoField(
  field: 'share_poster_share_title' | 'share_poster_share_text',
  token: string,
  setSettings: Dispatch<SetStateAction<Record<string, string>>>
) {
  const id = field === 'share_poster_share_title' ? 'admin-share-poster-title' : 'admin-share-poster-text'
  const el =
    typeof document !== 'undefined'
      ? (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null)
      : null
  let start = 0
  let end = 0
  if (el) {
    start = el.selectionStart ?? 0
    end = el.selectionEnd ?? 0
  }
  setSettings((prev) => {
    const cur = prev[field] || ''
    const next = el ? cur.slice(0, start) + token + cur.slice(end) : cur + token
    return { ...prev, [field]: next }
  })
  if (el) {
    const pos = start + token.length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }
}

export default function SettingsClient({ settings: initialSettings }: { settings: Setting[] }) {
  const [settings, setSettings] = useState<Record<string, string>>(() =>
    buildInitialSettingsMap(initialSettings)
  )
  const [generalOpen, setGeneralOpen] = useState(false)
  const [shareSectionOpen, setShareSectionOpen] = useState(false)
  const [refundOpenByKey, setRefundOpenByKey] = useState<Record<string, boolean>>({})
  const [isPending, startTransition] = useTransition()

  const insertShareToken = useCallback(
    (field: 'share_poster_share_title' | 'share_poster_share_text', token: string) => {
      insertTokenIntoField(field, token, setSettings)
    },
    []
  )

  const generalSettings = useMemo((): Setting[] => {
    return GENERAL_SETTING_KEYS.map((key) => {
      const row = initialSettings.find((s) => s.key === key)
      return row ?? syntheticGeneralRow(key)
    })
  }, [initialSettings])
  const refundOrder = ['refund_tiers_unsolo', 'refund_tiers_host', 'refund_tiers_stays', 'refund_tiers_activities', 'refund_tiers_rentals']
  const refundSettings = initialSettings
    .filter((s) => REFUND_KEYS.has(s.key))
    .sort((a, b) => refundOrder.indexOf(a.key) - refundOrder.indexOf(b.key))

  function defaultsForKey(key: string) {
    switch (key) {
      case 'refund_tiers_host': return defaultHostRefundTiers()
      case 'refund_tiers_stays': return defaultStaysRefundTiers()
      case 'refund_tiers_activities': return defaultActivitiesRefundTiers()
      case 'refund_tiers_rentals': return defaultRentalsRefundTiers()
      default: return defaultUnsoloRefundTiers()
    }
  }

  function handleSave() {
    startTransition(async () => {
      for (const [key, value] of Object.entries(settings)) {
        if (REFUND_KEYS.has(key)) {
          const tiers = parseRefundTiersJson(value, defaultsForKey(key))
          const check = validateRefundTiers(tiers)
          if (!check.ok) {
            toast.error(check.message)
            return
          }
        }
      }

      const supabase = createClient()
      const updatedAt = new Date().toISOString()
      const rows = Object.entries(settings).map(([key, value]) => ({
        key,
        value: value ?? '',
        updated_at: updatedAt,
      }))
      // Single round-trip: sequential per-key upserts can trip the browser client's
      // Web Locks–based session layer ("Lock broken by another request with the 'steal' option").
      const { error } = await supabase.from('platform_settings').upsert(rows, { onConflict: 'key' })
      if (error) {
        toast.error(`Failed to save settings: ${error.message}`)
      } else {
        toast.success('Settings saved!')
      }
    })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="rounded-xl border border-border bg-card/30 overflow-hidden max-w-3xl">
        <button
          type="button"
          className="relative flex w-full items-start gap-2 pl-4 pr-10 py-3 text-left hover:bg-card/60 transition-colors"
          onClick={() => setGeneralOpen((v) => !v)}
        >
          <Settings className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold leading-tight">General platform settings</div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed pr-1">
              Group size, payment deadline, per-category commissions
            </p>
          </div>
          <ChevronRight
            className={cn(
              'absolute right-3 top-3 h-3.5 w-3.5 text-muted-foreground transition-transform',
              generalOpen && 'rotate-90'
            )}
            aria-hidden
          />
        </button>
        {generalOpen ? (
          <div className="border-t border-border px-4 py-1 bg-card/20">
            {generalSettings.map((s) => {
              const config = SETTING_LABELS[s.key] || { label: s.key, type: 'text' as const }
              if (s.key === 'wander_hero_image_url') {
                return (
                  <div key={s.key} className="space-y-2 border-b border-border/50 py-3 last:border-0">
                    <div className="min-w-0 sm:max-w-[min(100%,32rem)]">
                      <div className="text-sm font-medium flex items-center gap-2">
                        <Settings className="h-3.5 w-3.5 text-primary shrink-0" />
                        {config.label}
                      </div>
                      {s.description ? (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{s.description}</p>
                      ) : null}
                    </div>
                    <WanderHeroImageField
                      value={settings.wander_hero_image_url || ''}
                      onChange={v => setSettings(prev => ({ ...prev, wander_hero_image_url: v }))}
                    />
                  </div>
                )
              }
              if (s.key === 'wander_trust_badge_text') {
                return (
                  <div key={s.key} className="space-y-2 border-b border-border/50 py-3 last:border-0">
                    <div className="min-w-0 sm:max-w-[min(100%,32rem)]">
                      <div className="text-sm font-medium flex items-center gap-2">
                        <Settings className="h-3.5 w-3.5 text-primary shrink-0" />
                        {config.label}
                      </div>
                      {s.description ? (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{s.description}</p>
                      ) : null}
                    </div>
                    <Textarea
                      value={settings.wander_trust_badge_text || ''}
                      onChange={e => setSettings(prev => ({ ...prev, wander_trust_badge_text: e.target.value }))}
                      placeholder={DEFAULT_WANDER_TRUST_BADGE_TEXT}
                      className="max-w-xl min-h-[72px] text-sm bg-secondary border-border"
                      spellCheck
                    />
                  </div>
                )
              }
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
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-card/40 overflow-hidden max-w-3xl">
        <button
          type="button"
          className="relative flex w-full items-start gap-2 pl-4 pr-10 py-3 text-left hover:bg-card/50 transition-colors"
          onClick={() => setShareSectionOpen((v) => !v)}
        >
          <Share2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold leading-tight">Profile share poster</div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed pr-1">
              Native share title, message, and poster footer
            </p>
          </div>
          <ChevronRight
            className={cn(
              'absolute right-3 top-3 h-3.5 w-3.5 text-muted-foreground transition-transform',
              shareSectionOpen && 'rotate-90'
            )}
            aria-hidden
          />
        </button>
        {shareSectionOpen ? (
          <div className="border-t border-border px-4 py-4 space-y-4 bg-card/20">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Tokens are replaced when someone shares <strong className="text-foreground">their</strong> poster — you
              don’t need a real URL here. Use the buttons to insert at the cursor.
            </p>
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-border/80 bg-muted/20 px-2 py-2">
              <span className="text-[10px] font-medium text-muted-foreground w-full sm:w-auto">Insert at cursor:</span>
              {SHARE_PLACEHOLDERS.map((p) => (
                <button
                  key={p.token}
                  type="button"
                  title={p.hint}
                  className="text-[11px] font-mono px-2 py-1 rounded-md border border-border bg-secondary/80 hover:bg-secondary text-foreground"
                  onClick={() => {
                    const ae = document.activeElement
                    const field =
                      ae?.id === 'admin-share-poster-title'
                        ? 'share_poster_share_title'
                        : ae?.id === 'admin-share-poster-text'
                          ? 'share_poster_share_text'
                          : 'share_poster_share_text'
                    insertShareToken(field, p.token)
                  }}
                >
                  {p.token}
                </button>
              ))}
            </div>
            <div className="space-y-4">
              {SHARE_POSTER_ORDER.map((key) => {
                const row = initialSettings.find((x) => x.key === key)
                const config = SETTING_LABELS[key]!
                const description = row?.description ?? null
                const showTokens = key === 'share_poster_share_title' || key === 'share_poster_share_text'
                return (
                  <div key={key} className="space-y-1.5">
                    <label className="text-sm font-medium">{config.label}</label>
                    {description ? (
                      <p className="text-xs text-muted-foreground leading-snug">{description}</p>
                    ) : null}
                    {config.type === 'textarea' ? (
                      <Textarea
                        id={key === 'share_poster_share_text' ? 'admin-share-poster-text' : undefined}
                        value={settings[key] || ''}
                        onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="bg-secondary border-border min-h-[72px] text-sm max-w-xl"
                        spellCheck={true}
                      />
                    ) : (
                      <Input
                        id={key === 'share_poster_share_title' ? 'admin-share-poster-title' : undefined}
                        value={settings[key] || ''}
                        onChange={(e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="bg-secondary border-border h-9 max-w-xl"
                      />
                    )}
                    {showTokens ? (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {SHARE_PLACEHOLDERS.map((p) => (
                          <button
                            key={`${key}-${p.token}`}
                            type="button"
                            title={p.hint}
                            className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                            onClick={() =>
                              insertShareToken(
                                key as 'share_poster_share_title' | 'share_poster_share_text',
                                p.token
                              )
                            }
                          >
                            + {p.token}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 max-w-3xl">
        {refundSettings.map((s) => {
          const config = SETTING_LABELS[s.key]!
          const open = !!refundOpenByKey[s.key]
          return (
            <div
              key={s.key}
              className="rounded-xl border border-border bg-card/30 overflow-hidden max-w-3xl"
            >
              <button
                type="button"
                className="relative flex w-full items-start gap-2 pl-4 pr-10 py-3 text-left hover:bg-card/60 transition-colors"
                onClick={() => setRefundOpenByKey((m) => ({ ...m, [s.key]: !open }))}
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
                    defaults={defaultsForKey(s.key)}
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
