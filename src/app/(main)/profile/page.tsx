'use client'

import { useState, useEffect } from 'react'
import { updateProfile, updateUsername } from '@/actions/profile'
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
import { Pencil, Clock, Check, X } from 'lucide-react'

export default function EditProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)

  // Username editing state
  const [editingUsername, setEditingUsername] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [usernameLoading, setUsernameLoading] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('*').eq('id', user.id).single()
        .then(({ data }) => {
          setProfile(data as Profile)
          if (data) setNewUsername(data.username)
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

  // Calculate username cooldown
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
    if (result?.error) {
      toast.error(result.error)
    } else {
      toast.success('Profile updated!')
    }
    setLoading(false)
  }

  async function handleUsernameChange() {
    if (!newUsername.trim() || newUsername === profile!.username) {
      setEditingUsername(false)
      return
    }
    setUsernameLoading(true)
    const result = await updateUsername(newUsername.trim().toLowerCase())
    if (result?.error) {
      toast.error(result.error)
    } else {
      toast.success('Username updated!')
      setProfile({ ...profile!, username: newUsername.trim().toLowerCase(), username_changed_at: new Date().toISOString() })
      setEditingUsername(false)
    }
    setUsernameLoading(false)
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
              <Avatar className="h-16 w-16 border border-border">
                <AvatarImage src={profile.avatar_url || ''} />
                <AvatarFallback className="bg-primary/20 text-primary font-black text-lg">
                  {getInitials(profile.full_name || profile.username)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-medium">{profile.full_name || profile.username}</p>

                {/* Username with edit */}
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
                    <button
                      onClick={handleUsernameChange}
                      disabled={usernameLoading}
                      className="text-green-400 hover:text-green-300"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => { setEditingUsername(false); setNewUsername(profile.username) }}
                      className="text-muted-foreground hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm text-muted-foreground">@{profile.username}</p>
                    {canChangeUsername.allowed ? (
                      <button
                        onClick={() => setEditingUsername(true)}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title="Edit username"
                      >
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

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Full Name</label>
                  <Input
                    name="fullName"
                    defaultValue={profile.full_name || ''}
                    placeholder="Your name"
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Location</label>
                  <Input
                    name="location"
                    defaultValue={profile.location || ''}
                    placeholder="Mumbai, India"
                    className="bg-secondary border-border"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Bio</label>
                <Textarea
                  name="bio"
                  defaultValue={profile.bio || ''}
                  placeholder="Tell fellow travelers about yourself..."
                  rows={3}
                  className="bg-secondary border-border resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Instagram</label>
                  <Input
                    name="instagram"
                    defaultValue={profile.instagram_url || ''}
                    placeholder="https://instagram.com/..."
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Website</label>
                  <Input
                    name="website"
                    defaultValue={profile.website_url || ''}
                    placeholder="https://..."
                    className="bg-secondary border-border"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-black font-bold hover:bg-primary/90"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
