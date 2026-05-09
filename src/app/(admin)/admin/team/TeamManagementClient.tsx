'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addTeamMember, removeTeamMember } from '@/actions/admin'
import {
  ROLE_LABELS,
  ROLE_COLORS,
  ADMIN_PERMISSION_LABELS,
  type TeamMember,
  type UserRole,
  type AdminPermissionKey,
} from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { UserPlus, Trash2, Shield, Camera, MapPin, MessageCircle, Home, Sliders } from 'lucide-react'

const ASSIGNABLE_ROLES: {
  value: UserRole
  label: string
  icon: typeof Shield
  description: string
}[] = [
  { value: 'admin', label: 'Admin', icon: Shield, description: 'Full access to all admin features' },
  {
    value: 'social_media_manager',
    label: 'Social Media Manager',
    icon: Camera,
    description: 'Bookings, custom date requests, community chats',
  },
  {
    value: 'field_person',
    label: 'Field Person',
    icon: MapPin,
    description: 'On-ground trip coordinator — bookings & custom requests',
  },
  {
    value: 'chat_responder',
    label: 'Chat Responder',
    icon: MessageCircle,
    description: 'Community chats + view bookings',
  },
  {
    value: 'host_onboarding_staff',
    label: 'Hosts Onboarding Staff',
    icon: Home,
    description: 'Approve / reject newly submitted host trips, stays & listings',
  },
  {
    value: 'custom',
    label: 'Other (Custom)',
    icon: Sliders,
    description: 'Pick specific permissions for this person on the fly',
  },
]

// All permission keys available for the "custom" role checklist
const ALL_PERMISSION_KEYS = Object.keys(ADMIN_PERMISSION_LABELS) as AdminPermissionKey[]

interface Props {
  teamMembers: TeamMember[]
}

export function TeamManagementClient({ teamMembers: initial }: Props) {
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [selectedRole, setSelectedRole] = useState<UserRole>('field_person')
  const [notes, setNotes] = useState('')
  const [customLabel, setCustomLabel] = useState('')
  const [selectedPermissions, setSelectedPermissions] = useState<AdminPermissionKey[]>([])
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function togglePermission(key: AdminPermissionKey) {
    setSelectedPermissions(prev =>
      prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key],
    )
  }

  function handleAdd() {
    if (!identifier.trim()) return
    const effectiveNotes = selectedRole === 'custom' && customLabel.trim()
      ? `[${customLabel.trim()}] ${notes.trim()}`.trim()
      : notes.trim() || undefined

    startTransition(async () => {
      const res = await addTeamMember(
        identifier.trim(),
        selectedRole,
        effectiveNotes || undefined,
        selectedRole === 'custom' ? selectedPermissions : undefined,
      )
      if (res.error) {
        setMessage({ type: 'error', text: res.error })
      } else {
        setMessage({ type: 'success', text: `Team member added as ${ROLE_LABELS[selectedRole]}.` })
        setIdentifier('')
        setNotes('')
        setCustomLabel('')
        setSelectedPermissions([])
        router.refresh()
      }
    })
  }

  function handleRemove(teamMemberId: string, name: string) {
    if (!confirm(`Remove ${name} from the team? Their role will be reset to "user".`)) return
    startTransition(async () => {
      const res = await removeTeamMember(teamMemberId)
      if (res.error) {
        setMessage({ type: 'error', text: res.error })
      } else {
        setMessage({ type: 'success', text: `${name} removed from team.` })
        router.refresh()
      }
    })
  }

  const activeMembers = initial.filter(m => m.is_active)
  const inactiveMembers = initial.filter(m => !m.is_active)

  return (
    <div className="space-y-8">
      {/* Add member form */}
      <div className="rounded-xl border border-border bg-card/50 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" /> Add Team Member
        </h2>

        {message && (
          <p
            className={`text-sm px-3 py-2 rounded-lg mb-4 ${
              message.type === 'error' ? 'bg-red-900/30 text-red-300' : 'bg-green-900/30 text-green-300'
            }`}
          >
            {message.text}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Username or Email</label>
            <Input
              placeholder="e.g. john_doe or john@example.com"
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              className="bg-secondary border-border"
            />
            <p className="text-xs text-muted-foreground mt-1">The user must have signed up already.</p>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Role</label>
            <select
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm"
              value={selectedRole}
              onChange={e => {
                setSelectedRole(e.target.value as UserRole)
                setSelectedPermissions([])
              }}
            >
              {ASSIGNABLE_ROLES.map(r => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Custom role: name + permissions checklist */}
          {selectedRole === 'custom' && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Role Name / Title</label>
                <Input
                  placeholder="e.g. Content Writer, Support Agent…"
                  value={customLabel}
                  onChange={e => setCustomLabel(e.target.value)}
                  className="bg-secondary border-border"
                />
                <p className="text-xs text-muted-foreground mt-1">Shown as a note on the member card.</p>
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-muted-foreground mb-2 block">
                  Permissions{' '}
                  <span className="text-rose-400">*</span>
                  <span className="ml-1 text-muted-foreground/60">select at least one</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {ALL_PERMISSION_KEYS.map(key => (
                    <label
                      key={key}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                        selectedPermissions.includes(key)
                          ? 'border-primary/60 bg-primary/10 text-foreground'
                          : 'border-border bg-secondary/50 text-muted-foreground hover:border-border/70 hover:text-foreground'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="accent-primary h-3.5 w-3.5 shrink-0"
                        checked={selectedPermissions.includes(key)}
                        onChange={() => togglePermission(key)}
                      />
                      {ADMIN_PERMISSION_LABELS[key]}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className={selectedRole === 'custom' ? '' : 'md:col-span-2'}>
            <label className="text-xs text-muted-foreground mb-1 block">Notes (optional)</label>
            <Input
              placeholder="e.g. Handles Rishikesh trips"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="bg-secondary border-border"
            />
          </div>
        </div>

        <Button
          className="mt-4 bg-primary text-black hover:bg-primary/90"
          onClick={handleAdd}
          disabled={
            isPending ||
            !identifier.trim() ||
            (selectedRole === 'custom' && selectedPermissions.length === 0)
          }
        >
          {isPending ? 'Adding...' : 'Add to Team'}
        </Button>

        {/* Role descriptions */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ASSIGNABLE_ROLES.map(r => {
            const Icon = r.icon
            return (
              <div key={r.value} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="text-xs text-muted-foreground">{r.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Active members */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Active Team ({activeMembers.length})</h2>
        <div className="space-y-2">
          {activeMembers.length === 0 && (
            <p className="text-muted-foreground text-center py-8">No team members yet. Add one above.</p>
          )}
          {activeMembers.map(m => {
            const profile = m.profile
            return (
              <div key={m.id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-card/50">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold shrink-0">
                    {(profile?.full_name || profile?.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{profile?.full_name || profile?.username}</p>
                    <p className="text-xs text-muted-foreground">@{profile?.username}</p>
                    {m.role === 'custom' && m.custom_permissions && m.custom_permissions.length > 0 && (
                      <p className="text-[10px] text-orange-300/80 mt-0.5">
                        {m.custom_permissions.length} permission{m.custom_permissions.length !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                  <Badge className={`${ROLE_COLORS[m.role as UserRole] || ''} text-xs ml-2 shrink-0`}>
                    {ROLE_LABELS[m.role as UserRole] || m.role}
                  </Badge>
                  {m.notes && <span className="text-xs text-muted-foreground ml-2 truncate">— {m.notes}</span>}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-300 hover:bg-red-900/20 shrink-0"
                  onClick={() => handleRemove(m.id, profile?.full_name || profile?.username || 'member')}
                  disabled={isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Inactive members */}
      {inactiveMembers.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 text-muted-foreground">Inactive ({inactiveMembers.length})</h2>
          <div className="space-y-2 opacity-60">
            {inactiveMembers.map(m => {
              const profile = m.profile
              return (
                <div key={m.id} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card/30">
                  <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-sm font-bold text-muted-foreground">
                    {(profile?.full_name || profile?.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">{profile?.full_name || profile?.username}</p>
                    <p className="text-xs text-muted-foreground">
                      @{profile?.username} · was {ROLE_LABELS[m.role as UserRole] || m.role}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
