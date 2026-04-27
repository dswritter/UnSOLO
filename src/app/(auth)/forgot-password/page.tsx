'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Mail, CheckCircle, Inbox } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { APP_URL } from '@/lib/constants'

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${APP_URL}/auth/callback?next=/reset-password`,
    })

    if (error) {
      toast.error(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="relative min-h-[100dvh] flex flex-col items-center justify-center px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-background"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_90%_60%_at_50%_-25%,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_55%)] dark:bg-[radial-gradient(ellipse_90%_55%_at_50%_-20%,color-mix(in_srgb,var(--primary)_18%,transparent),transparent_50%)]"
        aria-hidden
      />

      <div className="w-full max-w-[420px]">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <span className="text-4xl font-black tracking-tight">
              <span className="text-primary">UN</span>
              <span className="text-foreground">SOLO</span>
            </span>
          </Link>
          <p className="text-muted-foreground text-sm mt-2">Change the way you travel.</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm dark:shadow-none dark:ring-1 dark:ring-border/60 space-y-6">
          {sent ? (
            <div className="text-center space-y-5">
              <div
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-500/10"
                aria-hidden
              >
                <CheckCircle className="h-8 w-8 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-bold text-foreground">Check your email</h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  We sent a password reset link to{' '}
                  <strong className="font-semibold text-foreground break-all">{email}</strong>. Open the email
                  and follow the link to set a new password.
                </p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                No message after a few minutes? Check spam or promotions, then try again.
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full border-border text-foreground"
                onClick={() => {
                  setSent(false)
                  setEmail('')
                }}
              >
                Use a different email
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center text-center sm:items-start sm:text-left gap-4 sm:flex-row sm:items-center">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
                  <Mail className="h-7 w-7 text-primary" strokeWidth={2} />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">Reset your password</h1>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    Enter the email for your account. We&apos;ll send a secure link — valid for a limited time.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="forgot-email" className="text-sm font-medium text-foreground">
                    Email
                  </label>
                  <Input
                    id="forgot-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="h-11 bg-secondary/80 border-border text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={loading}
                >
                  {loading ? (
                    'Sending link…'
                  ) : (
                    <>
                      <Inbox className="mr-2 h-4 w-4" aria-hidden />
                      Send reset link
                    </>
                  )}
                </Button>
              </form>
            </>
          )}

          <div className="pt-1 border-t border-border/80">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1.5 w-full transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
