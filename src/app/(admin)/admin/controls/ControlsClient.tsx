'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/utils'

const SWITCHES = [
  { key: 'tribe_enabled', label: 'Tribe tab', hint: 'Turn off to hide Tribe everywhere (feed, posting, plan pages).' },
  { key: 'tribe_posting_enabled', label: 'New posts', hint: 'Pause posting during an incident; reading and replies still work.' },
  { key: 'host_offers_enabled', label: 'Host offers on plans', hint: 'Hosts offering to run community plans as paid trips.' },
  { key: 'push_enabled', label: 'Push notifications', hint: 'FCM, APNs and Web Push. In-app notifications continue.' },
] as const

export function ControlsClient({ initial }: { initial: Record<string, string> }) {
  const [v, setV] = useState<Record<string, string>>(initial)
  async function set(key: string, value: string, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return
    const prev = v[key]
    setV((x) => ({ ...x, [key]: value }))
    try { await apiFetch('/admin/flags', { method: 'PUT', body: { key, value } }); toast.success('Saved · live within 15 minutes on apps') }
    catch (e) { setV((x) => ({ ...x, [key]: prev })); toast.error((e as Error).message) }
  }
  return (
    <div className="max-w-3xl space-y-8">
      <ul className="divide-y divide-border border-y border-border">
        {SWITCHES.map((s) => {
          const on = (v[s.key] ?? 'true') !== 'false'
          return (
            <li key={s.key} className="flex items-center justify-between gap-4 py-4">
              <div><p className="font-semibold">{s.label}</p><p className="text-sm text-muted-foreground">{s.hint}</p></div>
              <button type="button" role="switch" aria-checked={on} aria-label={s.label}
                onClick={() => set(s.key, on ? 'false' : 'true', on ? `Turn off ${s.label.toLowerCase()} for everyone?` : undefined)}
                className={cn('relative h-7 w-12 shrink-0 rounded-full border', on ? 'border-foreground bg-foreground' : 'border-[color:var(--pc-rule2)]')}>
                <span className={cn('absolute top-0.5 h-[22px] w-[22px] rounded-full transition-all', on ? 'left-[22px] bg-background' : 'left-0.5 bg-[color:var(--pc-rule2)]')} />
              </button>
            </li>
          )
        })}
      </ul>
      <section>
        <h2 className="text-lg">Tribe rollout</h2>
        <p className="text-sm text-muted-foreground">Share of signed-in people who see Tribe. Same person always lands in the same bucket.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {['0', '10', '25', '50', '100'].map((p) => (
            <button key={p} type="button" className="pc-chip" aria-pressed={(v.tribe_rollout_percent ?? '100') === p} onClick={() => set('tribe_rollout_percent', p)}>{p}%</button>
          ))}
        </div>
      </section>
      <section>
        <h2 className="text-lg">Minimum app versions</h2>
        <p className="text-sm text-muted-foreground">Apps below this build ask people to update (use for security fixes only).</p>
        <div className="mt-3 grid max-w-md grid-cols-2 gap-3">
          {(['min_app_version_android', 'min_app_version_ios'] as const).map((k) => (
            <label key={k} className="text-sm">{k.endsWith('android') ? 'Android versionCode' : 'iOS build'}
              <input className="pc-input pc-mono mt-1" inputMode="numeric" defaultValue={v[k] ?? '1'} onBlur={(e) => /^\d{1,6}$/.test(e.target.value) && e.target.value !== v[k] && set(k, e.target.value)} />
            </label>
          ))}
        </div>
      </section>
    </div>
  )
}
