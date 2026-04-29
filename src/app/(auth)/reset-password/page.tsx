'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Lock, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { WANDER_HOME_SEARCH_HREF } from '@/lib/routing/wanderLandingPath'

export default function ResetPasswordPage() {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      toast.error(error.message)
    } else {
      setDone(true)
      toast.success('Password updated successfully!')
    }
    setLoading(false)
  }

  if (done) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <h1 className="text-xl font-bold">Password updated!</h1>
            <p className="text-sm text-muted-foreground">
              Your password has been changed. You can now sign in with your new password.
            </p>
            <Button asChild className="w-full bg-primary text-black font-bold">
              <Link href={WANDER_HOME_SEARCH_HREF}>Continue to UnSOLO</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/">
            <span className="text-4xl font-black">
              <span className="text-primary">UN</span><span className="text-foreground">SOLO</span>
            </span>
          </Link>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Set new password</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Choose a strong password for your account.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">New password</label>
              <Input
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="bg-secondary border-border"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Confirm password</label>
              <Input
                type="password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                className="bg-secondary border-border"
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-primary text-black font-bold hover:bg-primary/90"
              disabled={loading}
            >
              <Lock className="mr-2 h-4 w-4" />
              {loading ? 'Updating...' : 'Update Password'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
