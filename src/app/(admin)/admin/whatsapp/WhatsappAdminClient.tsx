'use client'

import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { MessageCircle, RotateCcw, Check } from 'lucide-react'
import type { WhatsappListingRow } from '@/actions/admin-whatsapp'
import { updatePackageWhatsapp, updateServiceListingWhatsapp } from '@/actions/admin-whatsapp'

type ServiceMap = Record<'stays' | 'activities' | 'rentals' | 'getting_around', WhatsappListingRow[]>

interface Props {
  platformDefault: string
  packages: WhatsappListingRow[]
  serviceListings: ServiceMap
}

function Row({
  listing,
  platformDefault,
  onSave,
}: {
  listing: WhatsappListingRow
  platformDefault: string
  onSave: (id: string, value: string) => Promise<{ error?: string; value?: string | null }>
}) {
  const initial = listing.whatsapp_number ?? ''
  const [value, setValue] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [pending, start] = useTransition()

  const usingDefault = !saved
  const dirty = value !== saved

  function submit() {
    start(async () => {
      const res = await onSave(listing.id, value)
      if (res.error) {
        toast.error(res.error)
        return
      }
      const next = res.value ?? ''
      setSaved(next)
      setValue(next)
      toast.success(next ? 'WhatsApp number updated' : 'Reverted to platform default')
    })
  }

  function resetToDefault() {
    setValue('')
    start(async () => {
      const res = await onSave(listing.id, '')
      if (res.error) {
        toast.error(res.error)
        return
      }
      setSaved('')
      toast.success('Reverted to platform default')
    })
  }

  return (
    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:gap-3 border-b border-border/50 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{listing.title}</div>
        <div className="text-[11px] text-muted-foreground">
          {usingDefault ? (
            <span>Using default · <span className="font-mono">+{platformDefault}</span></span>
          ) : (
            <span className="text-primary">Custom override</span>
          )}
          {listing.status && listing.status !== 'approved' && (
            <span className="ml-2 text-amber-400">· {listing.status}</span>
          )}
          {listing.is_active === false && <span className="ml-2 text-zinc-500">· hidden</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 sm:w-[20rem]">
        <Input
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={`+${platformDefault}`}
          className="bg-secondary border-border font-mono tracking-wider"
        />
        <Button
          size="sm"
          onClick={submit}
          disabled={pending || !dirty}
          className="bg-primary text-primary-foreground font-semibold shrink-0"
        >
          {pending ? '…' : dirty ? 'Save' : <Check className="h-4 w-4" />}
        </Button>
        {!usingDefault && (
          <Button
            size="sm"
            variant="outline"
            onClick={resetToDefault}
            disabled={pending}
            title="Reset to platform default"
            className="shrink-0"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

function Group({ title, rows, platformDefault, onSave }: { title: string; rows: WhatsappListingRow[]; platformDefault: string; onSave: (id: string, value: string) => Promise<{ error?: string; value?: string | null }> }) {
  if (rows.length === 0) return null
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <MessageCircle className="h-4 w-4 text-green-500" />
        <h2 className="font-semibold text-sm">{title}</h2>
        <span className="text-[11px] text-muted-foreground ml-auto">{rows.length} listing{rows.length === 1 ? '' : 's'}</span>
      </header>
      <div className="px-4">
        {rows.map(row => (
          <Row key={row.id} listing={row} platformDefault={platformDefault} onSave={onSave} />
        ))}
      </div>
    </section>
  )
}

const SERVICE_TITLES: Record<keyof ServiceMap, string> = {
  stays: 'Stays',
  activities: 'Activities',
  rentals: 'Rentals',
  getting_around: 'Getting Around',
}

export function WhatsappAdminClient({ platformDefault, packages, serviceListings }: Props) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
        <p className="font-semibold text-foreground">Platform default</p>
        <p className="text-xs text-muted-foreground mt-1">
          Shown when a listing has no override. Currently <span className="font-mono text-foreground">+{platformDefault}</span>. Change it in Settings.
        </p>
      </div>

      <Group title="Packages & Trips" rows={packages} platformDefault={platformDefault} onSave={updatePackageWhatsapp} />
      {(Object.keys(serviceListings) as (keyof ServiceMap)[]).map(type => (
        <Group
          key={type}
          title={SERVICE_TITLES[type]}
          rows={serviceListings[type]}
          platformDefault={platformDefault}
          onSave={updateServiceListingWhatsapp}
        />
      ))}
    </div>
  )
}
