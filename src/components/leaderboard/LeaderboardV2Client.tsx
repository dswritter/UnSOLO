'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Check, Luggage, MapPin, Search, Star, Trophy } from 'lucide-react'
import { getInitials, cn } from '@/lib/utils'
import { LeaderboardRankBadge } from '@/components/leaderboard/RankDisplay'
import type { LeaderboardEntryRow, MonthlyLeaderboardEntry } from '@/lib/leaderboard/leaderboardSnapshot'

const GOLD = '#fcba03'
const SIDEBAR_IMAGE = '/auth/dark-glowing-tent.png'
/** Fills (main) between navbar and footer; mobile keeps a minimum usable height. */
const LB_ROOT = 'flex min-h-0 flex-1 flex-col overflow-hidden max-lg:min-h-[min(100dvh,880px)]'

type Props = {
  entries: LeaderboardEntryRow[]
  currentUserId?: string
  myRank: number | null
  myEntry: LeaderboardEntryRow | null
  monthlyEntries: MonthlyLeaderboardEntry[]
}

function formatPts(n: number) {
  return `${n.toLocaleString('en-IN')} pts`
}

export function LeaderboardV2Client({
  entries,
  currentUserId,
  myRank,
  myEntry,
  monthlyEntries,
}: Props) {
  const [view, setView] = useState<'alltime' | 'monthly'>('alltime')
  const [search, setSearch] = useState('')
  const isMonthly = view === 'monthly'
  const rawList: (LeaderboardEntryRow | MonthlyLeaderboardEntry)[] = isMonthly ? monthlyEntries : entries

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rawList
    return rawList.filter(e => {
      return (
        (e.profile?.full_name || '').toLowerCase().includes(q) ||
        (e.profile?.username || '').toLowerCase().includes(q) ||
        (e.profile?.location || '').toLowerCase().includes(q)
      )
    })
  }, [search, rawList])

  return (
    <div className={cn('bg-[#0A0A0A] text-white', LB_ROOT, 'max-lg:overflow-y-auto max-lg:overflow-x-hidden')}>
      {/* Subtle green wash — Wander-adjacent */}
      <div
        className="pointer-events-none fixed inset-0 z-0 [background:radial-gradient(ellipse_80%_50%_at_10%_0%,rgba(22,101,52,0.2),transparent_50%)]"
        aria-hidden
      />
      <div
        className={cn(
          'relative z-[1] mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-1 flex-col px-4 sm:px-6 lg:px-10 lg:py-1',
          'lg:min-h-0 lg:flex-row lg:items-stretch lg:gap-8',
        )}
      >
        {/* —— Left: title, filters, search; only the table area scrolls —— */}
        <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden lg:max-w-[min(100%,58rem)]">
          <div className="shrink-0">
            <div className="flex items-start gap-3 pt-4 lg:pt-2">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#fcba03]/35 bg-[#fcba03]/10"
                style={{ color: GOLD }}
              >
                <Trophy className="h-6 w-6" strokeWidth={2} />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
                  <span className="text-white">Travel </span>
                  <span style={{ color: GOLD }}>Leaderboard</span>
                </h1>
                <p className="mt-1 text-sm text-white/60">Top solo travellers in India</p>
                <p className="mt-0.5 text-sm text-white/40">Compete, explore and earn your way to the top.</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setView('alltime')}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-bold transition',
                  view === 'alltime'
                    ? 'bg-[#fcba03] text-[#0a0a0a] shadow-md shadow-[#fcba03]/20'
                    : 'border border-white/15 bg-zinc-900/50 text-white/70 hover:border-white/25 hover:text-white',
                )}
              >
                All time
              </button>
              <button
                type="button"
                onClick={() => setView('monthly')}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-bold transition',
                  view === 'monthly'
                    ? 'bg-[#fcba03] text-[#0a0a0a] shadow-md shadow-[#fcba03]/20'
                    : 'border border-white/15 bg-zinc-900/50 text-white/70 hover:border-white/25 hover:text-white',
                )}
              >
                This Month
              </button>
            </div>

            <div className="relative mt-3">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
                aria-hidden
              />
              <input
                type="search"
                name="leaderboard-search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, @username, or place…"
                className="h-11 w-full rounded-xl border border-white/10 bg-zinc-950/80 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/35 shadow-inner outline-none transition focus:border-[#fcba03]/40 focus:ring-2 focus:ring-[#fcba03]/20"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-label="Search leaderboard"
              />
            </div>
            {isMonthly ? (
              <p className="mt-2 text-[11px] text-white/40">
                Ranked by trips completed this calendar month (activity).
              </p>
            ) : null}
          </div>

          {/* Scrollable rank list only (desktop) */}
          <div className="mt-3 flex min-h-0 flex-1 flex-col lg:min-h-0">
            <div
              className={cn(
                'min-h-0 flex-1 overflow-y-auto overflow-x-auto rounded-2xl border border-white/10 bg-zinc-950/40',
                'max-h-[min(50vh,480px)] lg:max-h-none',
              )}
            >
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 z-10 border-b border-white/10 bg-zinc-950/95 text-[11px] font-semibold uppercase tracking-wide text-white/45 backdrop-blur-sm">
                  <tr>
                    <th className="px-3 py-3 pl-4 sm:px-4">Rank</th>
                    <th className="px-3 py-3 sm:px-4">Traveller</th>
                    <th className="px-3 py-3 text-right sm:px-4">Trips</th>
                    <th className="px-3 py-3 text-right sm:px-4">Destinations</th>
                    <th className="px-3 py-3 text-right sm:px-4">Reviews</th>
                    <th className="px-3 py-3 pr-4 text-right sm:px-4">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {rawList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm text-white/50">
                        {isMonthly
                          ? 'No trips completed this month yet — be the first.'
                          : 'No scores yet. Complete a trip to appear here.'}
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm text-white/50">
                        No travellers matching &ldquo;{search.trim()}&rdquo; — try another name or @username.
                      </td>
                    </tr>
                  ) : (
                    filtered.map(entry => {
                      const rank = isMonthly
                        ? monthlyEntries.indexOf(entry as MonthlyLeaderboardEntry) + 1
                        : entries.indexOf(entry as LeaderboardEntryRow) + 1
                      const isMe = currentUserId === entry.user_id
                      const score = isMonthly
                        ? (entry as MonthlyLeaderboardEntry).monthly_trips
                        : entry.total_score
                      const name = entry.profile?.full_name || entry.profile?.username || 'Traveller'
                      return (
                        <tr
                          key={entry.user_id}
                          className={cn(
                            'border-b border-white/[0.06] transition-colors',
                            isMe ? 'bg-[#fcba03]/8' : 'hover:bg-white/[0.04]',
                          )}
                        >
                          <td className="px-3 py-3 pl-4 align-middle sm:px-4">
                            <div className="flex w-10 justify-center sm:w-12">
                              <LeaderboardRankBadge rank={rank} />
                            </div>
                          </td>
                          <td className="px-3 py-3 sm:px-4">
                            <Link
                              href={`/profile/${entry.profile?.username}`}
                              className="flex min-w-0 items-center gap-2.5 group"
                            >
                              <Avatar className="h-9 w-9 shrink-0 border border-white/10">
                                <AvatarImage src={entry.profile?.avatar_url || ''} />
                                <AvatarFallback className="bg-[#fcba03]/20 text-xs font-bold text-[#fcba03]">
                                  {getInitials(name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 text-left">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="truncate font-bold text-white group-hover:underline">
                                    {name}
                                  </span>
                                  {isMe ? (
                                    <span className="rounded-full bg-[#fcba03]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#fcba03]">
                                      You
                                    </span>
                                  ) : null}
                                </div>
                                <div className="truncate text-xs text-white/40">@{entry.profile?.username}</div>
                              </div>
                            </Link>
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-white/90 sm:px-4">
                            {entry.trips_completed}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-white/90 sm:px-4">
                            {entry.destinations_count}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-white/90 sm:px-4">
                            {entry.reviews_written}
                          </td>
                          <td className="px-3 py-3 pr-4 text-right sm:px-4">
                            {isMonthly ? (
                              <div>
                                <span className="font-black tabular-nums" style={{ color: GOLD }}>
                                  {typeof score === 'number' ? score : 0}
                                </span>
                                <span className="ml-1 text-[10px] text-white/40">trips</span>
                              </div>
                            ) : (
                              <span className="font-black tabular-nums" style={{ color: GOLD }}>
                                {formatPts(entry.total_score)}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {!isMonthly && myRank != null && myEntry && (
              <div className="mt-3 shrink-0 rounded-2xl border border-[#fcba03]/30 bg-[#fcba03]/5">
                <p className="border-b border-[#fcba03]/20 px-4 py-2 text-xs font-semibold text-[#fcba03]">Your rank</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <tbody>
                      <tr className="hover:bg-[#fcba03]/5">
                        <td className="px-3 py-3 pl-4 sm:px-4">
                          <div className="flex w-10 justify-center sm:w-12">
                            <LeaderboardRankBadge rank={myRank} />
                          </div>
                        </td>
                        <td className="px-3 py-3 sm:px-4">
                          <Link
                            href={`/profile/${myEntry.profile?.username}`}
                            className="flex min-w-0 items-center gap-2.5"
                          >
                            <Avatar className="h-9 w-9 border border-white/10">
                              <AvatarImage src={myEntry.profile?.avatar_url || ''} />
                              <AvatarFallback className="bg-[#fcba03]/20 text-xs font-bold text-[#fcba03]">
                                {getInitials(myEntry.profile?.full_name || myEntry.profile?.username || 'You')}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-bold text-white">
                                {myEntry.profile?.full_name || myEntry.profile?.username}
                              </div>
                              <div className="text-xs text-white/40">@{myEntry.profile?.username}</div>
                            </div>
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums sm:px-4">{myEntry.trips_completed}</td>
                        <td className="px-3 py-3 text-right tabular-nums sm:px-4">{myEntry.destinations_count}</td>
                        <td className="px-3 py-3 text-right tabular-nums sm:px-4">{myEntry.reviews_written}</td>
                        <td className="px-3 py-3 pr-4 text-right font-black sm:px-4" style={{ color: GOLD }}>
                          {formatPts(myEntry.total_score)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p className="mb-2 mt-2 flex shrink-0 items-center justify-center gap-1.5 py-1 text-center text-xs text-white/40 lg:mb-0">
              <Check className="h-3.5 w-3.5 text-emerald-500/80" />
              Scores update every 24 hours
            </p>
          </div>
        </div>

        {/* —— Right: how-it-works (full width) + tent fills rest of column —— */}
        <aside
          className={cn(
            'mt-6 flex w-full min-w-0 flex-col gap-3 lg:mt-0',
            'lg:min-h-0 lg:shrink-0 lg:gap-0 lg:pb-2 lg:pt-2',
            'h-auto lg:h-full',
            'lg:max-w-md lg:min-w-[16rem] lg:basis-80 lg:flex-[1_0_32%]',
          )}
        >
          <div
            className={cn(
              'w-full shrink-0 rounded-2xl border border-white/10 bg-zinc-900/60 p-4 shadow-lg backdrop-blur-sm',
              'lg:rounded-3xl lg:p-5',
            )}
          >
            <p className="text-sm font-bold text-white">How it works</p>
            <p className="mt-1 text-xs leading-relaxed text-white/50">
              Earn points by sharing your journeys and helping the community.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-white/10 pt-4 sm:grid-cols-3 sm:gap-4 sm:pt-4">
              <div className="flex flex-col items-start gap-1.5 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5 sm:min-w-0">
                <Luggage className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                <p className="text-xs leading-snug text-white/80">
                  <span className="block font-semibold text-white">25 pts / successful booking</span>
                  <span className="text-white/55"> — share your trips</span>
                </p>
              </div>
              <div className="flex flex-col items-start gap-1.5 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5 sm:min-w-0">
                <MapPin className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                <p className="text-xs leading-snug text-white/80">
                  <span className="block font-semibold text-white">15 pts / destination</span>
                  <span className="text-white/55"> — add new destinations</span>
                </p>
              </div>
              <div className="flex flex-col items-start gap-1.5 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5 sm:min-w-0">
                <Star className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                <p className="text-xs leading-snug text-white/80">
                  <span className="block font-semibold text-white">10 pts / review</span>
                  <span className="text-white/55"> — write helpful reviews</span>
                </p>
              </div>
            </div>
          </div>

          <div
            className={cn(
              'relative min-h-[220px] w-full flex-1 overflow-hidden rounded-3xl border border-white/10 bg-zinc-900 shadow-xl',
              'lg:mt-3 lg:min-h-0',
            )}
          >
            <Image
              src={SIDEBAR_IMAGE}
              alt=""
              fill
              className="object-cover object-left"
              sizes="(min-width: 1024px) 400px, 100vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/10" />
            <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
              <p className="text-lg font-bold leading-snug text-white sm:text-xl">
                Every journey earns you <span className="text-[#fcba03]">points</span>. Keep exploring. Keep
                climbing.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
