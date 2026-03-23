'use client'

import { useState, useEffect } from 'react'
import { getReferralDashboard } from '@/actions/profile'
import { Card, CardContent } from '@/components/ui/card'
import { Gift, Copy, Check, MessageCircle, Users, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { APP_URL } from '@/lib/constants'
import Link from 'next/link'

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
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-2xl px-4 py-10">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-secondary rounded" />
            <div className="h-64 bg-secondary rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  const referralLink = data.referralCode ? `${APP_URL}/signup?ref=${data.referralCode}` : ''
  const whatsappMsg = encodeURIComponent(
    `Hey! Join me on UnSOLO — India's solo travel community. Sign up with my code and get ₹200 off your first trip!\n${referralLink}`
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
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link href="/explore" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-black flex items-center gap-3">
            <Gift className="h-8 w-8 text-primary" />
            Refer & <span className="text-primary">Earn</span>
          </h1>
          <p className="text-muted-foreground mt-2">
            Share your code. When a friend signs up and books their first trip, you earn <span className="text-primary font-bold">₹500</span> and they get <span className="text-primary font-bold">₹200 off</span>!
          </p>
        </div>

        <div className="space-y-6">
          {/* Referral Code Card */}
          <Card className="border-border bg-card">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-muted-foreground block mb-1">Your Referral Code</span>
                  <code className="text-3xl font-mono font-black text-primary tracking-[0.2em]">{data.referralCode}</code>
                </div>
                <button onClick={copyCode} className="p-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors" title="Copy code">
                  {codeCopied ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5 text-muted-foreground" />}
                </button>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary/50 rounded-xl px-4 py-3">
                <span className="truncate flex-1 font-mono text-xs">{referralLink}</span>
                <button onClick={copyLink} className="text-primary hover:underline flex-shrink-0 text-xs font-medium">
                  {linkCopied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>

              {/* Share buttons */}
              <div className="grid grid-cols-2 gap-3">
                <a
                  href={`https://wa.me/?text=${whatsappMsg}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium transition-colors"
                >
                  <MessageCircle className="h-5 w-5" />
                  Share on WhatsApp
                </a>
                <button
                  onClick={copyLink}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl border border-border bg-secondary hover:bg-secondary/80 font-medium transition-colors"
                >
                  <Copy className="h-5 w-5" />
                  Copy Link
                </button>
              </div>
            </CardContent>
          </Card>

          {/* How it works */}
          <Card className="border-border bg-card">
            <CardContent className="p-6">
              <h3 className="font-bold mb-4">How it works</h3>
              <div className="space-y-4">
                {[
                  { step: '1', title: 'Share your code', desc: 'Send your referral link to friends via WhatsApp or any messaging app' },
                  { step: '2', title: 'Friend signs up', desc: 'They create an account using your referral link' },
                  { step: '3', title: 'Friend books a trip', desc: 'They get ₹200 off their first booking' },
                  { step: '4', title: 'You earn ₹500', desc: 'Credits are added to your account automatically' },
                ].map(item => (
                  <div key={item.step} className="flex items-start gap-3">
                    <div className="h-7 w-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-primary">{item.step}</span>
                    </div>
                    <div>
                      <div className="text-sm font-medium">{item.title}</div>
                      <div className="text-xs text-muted-foreground">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-border bg-card">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-black text-primary">{data.totalReferred}</div>
                <div className="text-xs text-muted-foreground">Friends Referred</div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-black text-primary">{data.pendingReferred}</div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </CardContent>
            </Card>
            <Card className="border-border bg-card">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-black text-primary">₹{((data.creditsPaise || 0) / 100).toLocaleString('en-IN')}</div>
                <div className="text-xs text-muted-foreground">Credits Earned</div>
              </CardContent>
            </Card>
          </div>

          {/* Referral list */}
          {data.referrals.length > 0 && (
            <Card className="border-border bg-card">
              <CardContent className="p-6">
                <h3 className="font-bold mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" /> Your Referrals
                </h3>
                <div className="space-y-2">
                  {data.referrals.map((r, i) => (
                    <div key={i} className="flex items-center justify-between bg-secondary/20 rounded-lg px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                          {(r.fullName || r.username).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-sm font-medium">{r.fullName || r.username}</span>
                          <span className="text-xs text-muted-foreground ml-2">@{r.username}</span>
                        </div>
                      </div>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        r.status === 'credited'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}>
                        {r.status === 'credited' ? '₹500 earned' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
