'use client'

import { useState, useEffect } from 'react'
import { getReferralDashboard } from '@/actions/profile'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Gift, Copy, Check, MessageCircle, Users, ArrowLeft, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { APP_URL } from '@/lib/constants'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export default function ReferralsPage() {
  const [data, setData] = useState<{
    referralCode: string | null
    creditsPaise: number
    totalReferred: number
    pendingReferred: number
    creditedReferred: number
    referrals: { status: string; username: string; fullName: string | null }[]
  } | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    getReferralDashboard().then(setData)
  }, [])

  if (!data) {
    return (
      <div className="relative min-h-[100dvh]">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-background" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_85%_55%_at_50%_-20%,color-mix(in_srgb,var(--primary)_12%,transparent),transparent_50%)] dark:bg-[radial-gradient(ellipse_85%_50%_at_50%_-15%,color-mix(in_srgb,var(--primary)_16%,transparent),transparent_48%)]"
          aria-hidden
        />
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="animate-pulse space-y-6">
            <div className="h-9 w-56 rounded-lg bg-secondary" />
            <div className="h-40 rounded-2xl bg-secondary" />
            <div className="h-32 rounded-2xl bg-secondary" />
            <div className="grid grid-cols-3 gap-3">
              <div className="h-24 rounded-2xl bg-secondary" />
              <div className="h-24 rounded-2xl bg-secondary" />
              <div className="h-24 rounded-2xl bg-secondary" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  const referralLink = data.referralCode ? `${APP_URL}/signup?ref=${data.referralCode}` : ''
  const whatsappMsg = encodeURIComponent(
    `Hey! Join me on UnSOLO — India's solo travel community. Sign up with my code and get ₹200 off your first trip!\n${referralLink}`,
  )

  function copyCode() {
    if (!data?.referralCode) return
    navigator.clipboard.writeText(data.referralCode)
    setCodeCopied(true)
    toast.success('Code copied!')
    setTimeout(() => setCodeCopied(false), 2000)
  }

  function copyLink() {
    navigator.clipboard.writeText(referralLink)
    setLinkCopied(true)
    toast.success('Link copied!')
    setTimeout(() => setLinkCopied(false), 2000)
  }

  return (
    <div className="relative min-h-[100dvh] pb-12">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-background" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_85%_55%_at_50%_-20%,color-mix(in_srgb,var(--primary)_12%,transparent),transparent_50%)] dark:bg-[radial-gradient(ellipse_85%_50%_at_50%_-15%,color-mix(in_srgb,var(--primary)_16%,transparent),transparent_48%)]"
        aria-hidden
      />

      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-10">
        <Link
          href="/explore"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          Back to Explore
        </Link>

        <header className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10">
              <Gift className="h-7 w-7 text-primary" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
                Refer & <span className="text-primary">earn</span>
              </h1>
              <p className="text-muted-foreground mt-2 text-sm sm:text-base leading-relaxed max-w-xl">
                Share your code. When a friend signs up and books their first trip, you earn{' '}
                <span className="text-foreground font-semibold">₹500</span> and they get{' '}
                <span className="text-foreground font-semibold">₹200 off</span>.
              </p>
            </div>
          </div>
        </header>

        <div className="space-y-6">
          <Card className="border-border bg-card/95 shadow-sm dark:shadow-none dark:ring-1 dark:ring-border/60 overflow-hidden">
            <CardContent className="p-6 sm:p-7 space-y-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Your code</span>
                  <p className="mt-1">
                    <code className="text-2xl sm:text-3xl font-mono font-black text-primary tracking-[0.18em] break-all">
                      {data.referralCode}
                    </code>
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 rounded-xl border-border shrink-0"
                  onClick={copyCode}
                  title="Copy code"
                  aria-label="Copy referral code"
                >
                  {codeCopied ? (
                    <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="h-5 w-5 text-muted-foreground" />
                  )}
                </Button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-border bg-secondary/50 px-4 py-3">
                <span className="truncate flex-1 font-mono text-xs text-foreground/90">{referralLink}</span>
                <button
                  type="button"
                  onClick={copyLink}
                  className="text-sm font-semibold text-primary hover:underline shrink-0"
                >
                  {linkCopied ? 'Copied' : 'Copy link'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <a
                  href={`https://wa.me/?text=${whatsappMsg}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-white transition-colors',
                    'bg-[#25D366] hover:bg-[#1ebe57] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  )}
                >
                  <MessageCircle className="h-5 w-5" />
                  Share on WhatsApp
                </a>
                <Button
                  type="button"
                  variant="outline"
                  className="h-[52px] rounded-xl border-border font-semibold"
                  onClick={copyLink}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy link
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/95 shadow-sm dark:shadow-none dark:ring-1 dark:ring-border/60">
            <CardContent className="p-6 sm:p-7">
              <h2 className="font-bold text-lg flex items-center gap-2 mb-5">
                <Sparkles className="h-5 w-5 text-primary shrink-0" />
                How it works
              </h2>
              <ul className="space-y-4">
                {[
                  { step: '1', title: 'Share your code', desc: 'Send your link on WhatsApp or any app.' },
                  { step: '2', title: 'Friend signs up', desc: 'They create an account with your link.' },
                  { step: '3', title: 'Friend books a trip', desc: 'They get ₹200 off their first booking.' },
                  { step: '4', title: 'You earn ₹500', desc: 'Wallet credits are added automatically.' },
                ].map((item) => (
                  <li key={item.step} className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full border border-primary/20 bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-primary">{item.step}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {[
              { label: 'Referred', value: data.totalReferred },
              { label: 'Pending', value: data.pendingReferred },
              {
                label: 'Credits',
                value: `₹${((data.creditsPaise || 0) / 100).toLocaleString('en-IN')}`,
              },
            ].map((stat) => (
              <Card
                key={stat.label}
                className="border-border bg-card/95 shadow-sm dark:shadow-none dark:ring-1 dark:ring-border/60"
              >
                <CardContent className="p-3 sm:p-4 text-center">
                  <div className="text-lg sm:text-2xl font-black text-primary tabular-nums leading-tight">
                    {stat.value}
                  </div>
                  <div className="text-[10px] sm:text-xs text-muted-foreground mt-1 leading-tight">{stat.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {data.referrals.length > 0 && (
            <Card className="border-border bg-card/95 shadow-sm dark:shadow-none dark:ring-1 dark:ring-border/60">
              <CardContent className="p-6 sm:p-7">
                <h2 className="font-bold text-lg flex items-center gap-2 mb-4">
                  <Users className="h-5 w-5 text-primary" />
                  Your referrals
                </h2>
                <ul className="space-y-2">
                  {data.referrals.map((r, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-secondary/30 px-4 py-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full border border-primary/15 bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                          {(r.fullName || r.username).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-foreground truncate block">
                            {r.fullName || r.username}
                          </span>
                          <span className="text-xs text-muted-foreground">@{r.username}</span>
                        </div>
                      </div>
                      <span
                        className={cn(
                          'text-xs font-medium px-2.5 py-1 rounded-full border shrink-0',
                          r.status === 'credited'
                            ? 'bg-emerald-500/12 text-emerald-900 border-emerald-500/30 dark:text-emerald-200'
                            : 'bg-amber-500/12 text-amber-900 border-amber-500/30 dark:text-amber-200',
                        )}
                      >
                        {r.status === 'credited' ? '₹500 earned' : 'Pending'}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
