'use client'

import { useState, useEffect, useRef } from 'react'
import { updateProfile, updateUsername, updatePhoneSettings, updatePrivacySettings } from '@/actions/profile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/utils'
import { Pencil, Clock, Check, X, Camera, Upload, Phone, Globe, Lock } from 'lucide-react'

const DEFAULT_AVATARS = [
  { url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=beach&backgroundColor=ffdfbf&skinColor=f2d3b1', label: '🏖️ Beach', theme: 'beach' },
  { url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=mountain&backgroundColor=b6e3f4&skinColor=f2d3b1', label: '🏔️ Mountain', theme: 'mountain' },
  { url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=desert&backgroundColor=ffd5dc&skinColor=d08b5b', label: '🏜️ Desert', theme: 'desert' },
  { url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=chill&backgroundColor=c0aede&skinColor=f2d3b1', label: '😎 Chill', theme: 'chill' },
  { url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=hardcore&backgroundColor=ff9999&skinColor=ae5d29', label: '🔥 Hardcore', theme: 'hardcore' },
]

export default function EditProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Username editing state
  const [editingUsername, setEditingUsername] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [usernameLoading, setUsernameLoading] = useState(false)

  // Phone settings
  const [phoneNumber, setPhoneNumber] = useState('')
  const [phonePublic, setPhonePublic] = useState(false)
  const [phoneSaving, setPhoneSaving] = useState(false)

  // Privacy settings
  const [tripsPrivate, setTripsPrivate] = useState(false)
  const [statesPrivate, setStatesPrivate] = useState(false)
  const [privacySaving, setPrivacySaving] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('*').eq('id', user.id).single()
        .then(({ data }) => {
          const p = data as Profile & { phone_number?: string; phone_public?: boolean }
          setProfile(p)
          if (p) {
            setNewUsername(p.username)
            setPhoneNumber((p as Record<string, unknown>).phone_number as string || '')
            setPhonePublic((p as Record<string, unknown>).phone_public as boolean || false)
            setTripsPrivate((p as Record<string, unknown>).trips_private as boolean || false)
            setStatesPrivate((p as Record<string, unknown>).states_private as boolean || false)
          }
        })
    })
  }, [])

  if (!profile) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const canChangeUsername = (() => {
    if (!profile.username_changed_at) return { allowed: true, daysLeft: 0 }
    const lastChanged = new Date(profile.username_changed_at)
    const cooldownEnd = new Date(lastChanged.getTime() + 40 * 24 * 60 * 60 * 1000)
    const now = new Date()
    if (now >= cooldownEnd) return { allowed: true, daysLeft: 0 }
    const daysLeft = Math.ceil((cooldownEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    return { allowed: false, daysLeft }
  })()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const result = await updateProfile(formData)
    if (result?.error) toast.error(result.error)
    else toast.success('Profile updated!')
    setLoading(false)
  }

  async function handleUsernameChange() {
    if (!newUsername.trim() || newUsername === profile!.username) {
      setEditingUsername(false)
      return
    }
    setUsernameLoading(true)
    const result = await updateUsername(newUsername.trim().toLowerCase())
    if (result?.error) toast.error(result.error)
    else {
      toast.success('Username updated!')
      setProfile({ ...profile!, username: newUsername.trim().toLowerCase(), username_changed_at: new Date().toISOString() })
      setEditingUsername(false)
    }
    setUsernameLoading(false)
  }

  async function handleAvatarSelect(url: string) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id)
    if (error) toast.error(error.message)
    else {
      setProfile({ ...profile!, avatar_url: url })
      setShowAvatarPicker(false)
      toast.success('Avatar updated!')
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)

    const fd = new FormData()
    fd.append('file', file)
    fd.append('purpose', 'avatar')

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const json = await res.json()
      if (json.url) {
        await handleAvatarSelect(json.url)
      } else {
        toast.error(json.error || 'Upload failed')
      }
    } catch {
      toast.error('Upload failed')
    }
    setAvatarUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handlePhoneSave() {
    setPhoneSaving(true)
    const result = await updatePhoneSettings(phoneNumber, phonePublic)
    if (result.error) toast.error(result.error)
    else toast.success('Phone settings saved!')
    setPhoneSaving(false)
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black">Edit <span className="text-primary">Profile</span></h1>
            <p className="text-muted-foreground mt-1">Update your travel identity</p>
          </div>
          <Button variant="outline" className="border-border" asChild>
            <Link href={`/profile/${profile.username}`}>View Profile</Link>
          </Button>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-6 space-y-6">
            {/* Avatar + Username */}
            <div className="flex items-center gap-4">
              <div className="relative group">
                <Avatar className="h-16 w-16 border border-border">
                  <AvatarImage src={profile.avatar_url || ''} />
                  <AvatarFallback className="bg-primary/20 text-primary font-black text-lg">
                    {getInitials(profile.full_name || profile.username)}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                  className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Camera className="h-5 w-5 text-white" />
                </button>
              </div>
              <div className="flex-1">
                <p className="font-medium">{profile.full_name || profile.username}</p>

                {editingUsername ? (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-muted-foreground">@</span>
                    <Input
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                      className="h-7 bg-secondary border-border text-sm w-40"
                      maxLength={30}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleUsernameChange()
                        if (e.key === 'Escape') { setEditingUsername(false); setNewUsername(profile.username) }
                      }}
                    />
                    <button onClick={handleUsernameChange} disabled={usernameLoading} className="text-green-400 hover:text-green-300">
                      <Check className="h-4 w-4" />
                    </button>
                    <button onClick={() => { setEditingUsername(false); setNewUsername(profile.username) }} className="text-muted-foreground hover:text-white">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm text-muted-foreground">@{profile.username}</p>
                    {canChangeUsername.allowed ? (
                      <button onClick={() => setEditingUsername(true)} className="text-muted-foreground hover:text-primary transition-colors" title="Edit username">
                        <Pencil className="h-3 w-3" />
                      </button>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Username change on cooldown">
                        <Clock className="h-3 w-3" /> {canChangeUsername.daysLeft}d left
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Avatar picker */}
            {showAvatarPicker && (
              <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium">Choose an avatar</p>
                <div className="grid grid-cols-5 gap-3">
                  {DEFAULT_AVATARS.map(av => (
                    <button
                      key={av.theme}
                      onClick={() => handleAvatarSelect(av.url)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-colors hover:border-primary/60 ${profile.avatar_url === av.url ? 'border-primary bg-primary/10' : 'border-border'}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={av.url} alt={av.label} className="h-12 w-12 rounded-full" />
                      <span className="text-xs text-muted-foreground">{av.label}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  <Button size="sm" variant="outline" className="border-border text-xs gap-1" onClick={() => fileInputRef.current?.click()} disabled={avatarUploading}>
                    <Upload className="h-3 w-3" /> {avatarUploading ? 'Uploading...' : 'Upload Custom Photo'}
                  </Button>
                  <span className="text-xs text-muted-foreground">Max 5MB, JPEG/PNG</span>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Full Name</label>
                  <Input name="fullName" defaultValue={profile.full_name || ''} placeholder="Your name" className="bg-secondary border-border" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Location</label>
                  <Input name="location" defaultValue={profile.location || ''} placeholder="Mumbai, India" className="bg-secondary border-border" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Bio</label>
                <Textarea name="bio" defaultValue={profile.bio || ''} placeholder="Tell fellow travelers about yourself..." rows={3} className="bg-secondary border-border resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Instagram</label>
                  <Input name="instagram" defaultValue={profile.instagram_url || ''} placeholder="https://instagram.com/..." className="bg-secondary border-border" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Website</label>
                  <Input name="website" defaultValue={profile.website_url || ''} placeholder="https://..." className="bg-secondary border-border" />
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full bg-primary text-black font-bold hover:bg-primary/90">
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>

            {/* Phone Privacy Settings */}
            <div className="border-t border-border pt-4 space-y-3">
              <h3 className="font-medium flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" /> Phone Number & Privacy
              </h3>
              <div className="flex gap-3 items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground">Phone Number</label>
                  <Input
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="9876543210"
                    maxLength={10}
                    inputMode="numeric"
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Visibility</label>
                  <button
                    type="button"
                    onClick={() => setPhonePublic(!phonePublic)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${phonePublic ? 'border-green-500/40 bg-green-500/10 text-green-400' : 'border-border bg-secondary text-muted-foreground'}`}
                  >
                    {phonePublic ? <Globe className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                    {phonePublic ? 'Public' : 'Private'}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {phonePublic ? 'Everyone can see your phone number' : 'Others must request access to see your number'}
                </p>
                <Button size="sm" variant="outline" className="border-border text-xs" onClick={handlePhoneSave} disabled={phoneSaving}>
                  {phoneSaving ? 'Saving...' : 'Save Phone Settings'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Privacy Settings */}
        <Card className="bg-card border-border">
          <CardContent className="p-5 space-y-4">
            <h2 className="font-bold flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" /> Profile Privacy
            </h2>
            <p className="text-xs text-muted-foreground">Control what others can see on your public profile. The count is always visible, but you can hide the details.</p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setTripsPrivate(!tripsPrivate)}
                className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg border text-sm transition-colors ${tripsPrivate ? 'border-red-500/40 bg-red-500/10' : 'border-green-500/40 bg-green-500/10'}`}
              >
                <span>Trip details (packages, dates)</span>
                <span className={`text-xs font-medium ${tripsPrivate ? 'text-red-400' : 'text-green-400'}`}>
                  {tripsPrivate ? '🔒 Private' : '🌐 Public'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setStatesPrivate(!statesPrivate)}
                className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg border text-sm transition-colors ${statesPrivate ? 'border-red-500/40 bg-red-500/10' : 'border-green-500/40 bg-green-500/10'}`}
              >
                <span>States explored (list of states)</span>
                <span className={`text-xs font-medium ${statesPrivate ? 'text-red-400' : 'text-green-400'}`}>
                  {statesPrivate ? '🔒 Private' : '🌐 Public'}
                </span>
              </button>
            </div>
            <Button
              size="sm" variant="outline" className="border-border text-xs"
              onClick={async () => {
                setPrivacySaving(true)
                const result = await updatePrivacySettings(tripsPrivate, statesPrivate)
                if (result.error) toast.error(result.error)
                else toast.success('Privacy settings saved!')
                setPrivacySaving(false)
              }}
              disabled={privacySaving}
            >
              {privacySaving ? 'Saving...' : 'Save Privacy Settings'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
