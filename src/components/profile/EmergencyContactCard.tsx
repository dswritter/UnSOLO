'use client'

import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { v1 } from '@/lib/api/v1-client'

type Me = { user: { emergencyName: string | null; emergencyPhone: string | null } }

const tenDigits = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '')

/** Who we text when you raise an SOS on a trip. Only you see it. Saved through PATCH /api/v1/me. */
export function EmergencyContactCard() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saved, setSaved] = useState<{ name: string; phone: string } | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let live = true
    void v1<Me>('/me').then((r) => {
      if (!live) return
      setLoaded(true)
      if (!r.ok) return
      const n = r.data.user.emergencyName ?? '', p = tenDigits(r.data.user.emergencyPhone)
      setName(n); setPhone(p); setSaved({ name: n, phone: p })
    })
    return () => { live = false }
  }, [])

  const digits = phone.replace(/\D/g, '')
  const phoneOk = digits === '' || /^[6-9]\d{9}$/.test(digits)
  const changed = !saved || saved.name !== name.trim() || saved.phone !== digits

  async function save() {
    if (!phoneOk) { toast.error('Use a 10-digit Indian mobile number'); return }
    if (digits && !name.trim()) { toast.error('Add their name too'); return }
    setSaving(true)
    const r = await v1<Me>('/me', { method: 'PATCH', body: { emergencyName: name.trim() || null, emergencyPhone: digits || null } })
    setSaving(false)
    if (!r.ok) { toast.error(r.error); return }
    const n = r.data.user.emergencyName ?? '', p = tenDigits(r.data.user.emergencyPhone)
    setName(n); setPhone(p); setSaved({ name: n, phone: p })
    toast.success(p ? 'Emergency contact saved' : 'Emergency contact removed')
  }

  return (
    <Card id="emergency-contact" className="scroll-mt-24 bg-card border-border">
      <CardContent className="p-5 space-y-4">
        <h2 className="font-bold flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-red-500" aria-hidden /> Emergency contact
        </h2>
        <p className="text-xs text-muted-foreground">
          If you press SOS on a trip, we text this person with where you are. Only you can see it.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="emergency-name" className="text-xs text-muted-foreground">Name</label>
            <Input id="emergency-name" value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="For example: Asha (sister)" className="bg-secondary border-border" disabled={!loaded} autoComplete="off" />
          </div>
          <div className="space-y-1">
            <label htmlFor="emergency-phone" className="text-xs text-muted-foreground">Mobile number</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">+91</span>
              <Input
                id="emergency-phone"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit number"
                className="bg-secondary border-border"
                aria-invalid={!phoneOk}
                disabled={!loaded}
                autoComplete="off"
              />
            </div>
            {!phoneOk ? <p className="text-xs text-destructive">Use a 10-digit Indian mobile number</p> : null}
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" className="border-border text-xs" onClick={() => void save()} disabled={saving || !loaded || !changed || !phoneOk}>
          {saving ? 'Saving…' : 'Save emergency contact'}
        </Button>
      </CardContent>
    </Card>
  )
}
