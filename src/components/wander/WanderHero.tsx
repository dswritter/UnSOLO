import Link from 'next/link'
import Image from 'next/image'
import type { CSSProperties, ReactNode } from 'react'
import { Instagram, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isOptimizableImageUrl } from '@/lib/images/isOptimizableImageUrl'
import type { WanderHeroCopy } from '@/lib/wander/wanderQueries'

export function WanderHero({
  heroImageUrl,
  trustBadgeText,
  heroCopy,
  children,
  belowHero,
  proofCard,
  stats,
  quickLinks,
}: {
  heroImageUrl: string
  trustBadgeText: string
  heroCopy: WanderHeroCopy
  /** Trip finder (search form) shown in the panel beside the photo. */
  children?: ReactNode
  belowHero?: ReactNode
  proofCard?: ReactNode
  /** Trust numbers along the bottom of the photo. */
  stats?: ReactNode
  quickLinks?: Array<{ label: string; href: string }>
}) {
  const desktopTypography = heroCopy.desktopTypography
  const badgeStyle: CSSProperties | undefined = desktopTypography.badgeSize ? { fontSize: desktopTypography.badgeSize } : undefined
  const headlineStyle: CSSProperties | undefined = desktopTypography.headlineSize ? { fontSize: desktopTypography.headlineSize } : undefined
  const subtitleStyle: CSSProperties | undefined = desktopTypography.subtitleSize ? { fontSize: desktopTypography.subtitleSize } : undefined
  const instagramStyle: CSSProperties | undefined = desktopTypography.instagramSize ? { fontSize: desktopTypography.instagramSize } : undefined

  const headlineInner = (
    <h1 className="text-3xl font-black leading-[1.05] tracking-tight text-foreground sm:text-5xl xl:text-6xl" style={headlineStyle}>
      {heroCopy.line1}
      <br />
      {heroCopy.line2Before}
      <span className="brand-gold">{heroCopy.line2Accent}</span>
      {heroCopy.line2After}
    </h1>
  )

  let headlineBlock: ReactNode = headlineInner
  if (heroCopy.headlineLink) {
    headlineBlock = heroCopy.headlineLink.startsWith('/') ? (
      <Link href={heroCopy.headlineLink} className="block rounded-lg outline-offset-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        {headlineInner}
      </Link>
    ) : (
      <a
        href={heroCopy.headlineLink}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-lg outline-offset-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        {headlineInner}
      </a>
    )
  }

  let subtitleBlock: ReactNode = (
    <p className="mt-3 max-w-2xl text-sm text-foreground/80 md:text-base" style={subtitleStyle}>{heroCopy.subtitle}</p>
  )
  if (heroCopy.subtitleLink) {
    const subCls =
      'mt-3 inline-block max-w-2xl text-sm text-foreground/80 md:text-base rounded-lg outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary'
    subtitleBlock =
      heroCopy.subtitleLink.startsWith('/') ? (
        <Link href={heroCopy.subtitleLink} className={subCls} style={subtitleStyle}>
          {heroCopy.subtitle}
        </Link>
      ) : (
        <a href={heroCopy.subtitleLink} target="_blank" rel="noopener noreferrer" className={subCls} style={subtitleStyle}>
          {heroCopy.subtitle}
        </a>
      )
  }

  const instagramHref = heroCopy.instagramUrl
  const instagramCtaShared = cn(
    'glass-card flex w-full flex-col gap-2 p-2.5 text-left text-foreground transition-transform duration-200 hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
  )
  const instagramCta =
    instagramHref != null ? (
      instagramHref.startsWith('/') ? (
        <Link href={instagramHref} className={instagramCtaShared}>
          <span className="flex items-start gap-2">
            <Instagram className="mt-0.5 h-4 w-4 shrink-0 text-[#f472b6]" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1 break-words text-[11px] font-semibold leading-snug [overflow-wrap:anywhere] sm:text-xs" style={instagramStyle}>
              {heroCopy.instagramLabel}
            </span>
          </span>
        </Link>
      ) : (
        <a href={instagramHref} target="_blank" rel="noopener noreferrer" className={instagramCtaShared}>
          <span className="flex items-start gap-2">
            <Instagram className="mt-0.5 h-4 w-4 shrink-0 text-[#f472b6]" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1 break-words text-[11px] font-semibold leading-snug [overflow-wrap:anywhere] sm:text-xs" style={instagramStyle}>
              {heroCopy.instagramLabel}
            </span>
          </span>
          <span className="sr-only"> (opens in new tab)</span>
        </a>
      )
    ) : null

  return (
    <section className="relative w-full">
      <div className="mx-auto w-full max-w-[min(100%,1920px)] px-4 pt-5 pb-2 sm:px-6 md:pt-6 lg:px-10">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(24rem,1fr)] lg:items-stretch">
          {/* Photo fades into the page colour at the bottom, so copy sits on white in day and slate in dusk */}
          <div className="relative isolate flex min-h-[30rem] flex-col overflow-hidden rounded-[28px] text-foreground shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
            <Image
              src={heroImageUrl}
              alt=""
              fill
              // LCP image — fetch it ahead of below-the-fold work.
              priority
              sizes="(min-width: 1024px) 60vw, 100vw"
              // Admin can set this to any HTTPS host; only optimize when next.config.ts allows the host.
              unoptimized={!isOptimizableImageUrl(heroImageUrl)}
              className="-z-10 object-cover object-center"
            />
            <div
              className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(0,0,0,0.22)_0%,transparent_28%,transparent_38%,color-mix(in_oklab,var(--background)_70%,transparent)_62%,var(--background)_88%)]"
              aria-hidden
            />
            <div className="flex flex-1 flex-col justify-between gap-6 p-6 lg:p-8">
              <div className="flex items-start justify-between gap-4">
                <p
                  className="inline-flex w-fit max-w-[min(100%,32rem)] items-start gap-2 rounded-full border border-white/20 bg-black/25 px-3 py-1.5 text-xs font-medium leading-snug text-white backdrop-blur-md"
                  style={badgeStyle}
                >
                  <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-primary" strokeWidth={2} aria-hidden />
                  <span>{trustBadgeText}</span>
                </p>
                <div className="flex w-[8.5rem] shrink-0 flex-col items-stretch gap-2.5">
                  {instagramCta}
                  {proofCard}
                </div>
              </div>
              <div className="min-w-0 max-w-3xl">
                {headlineBlock}
                {subtitleBlock}
                {stats ? <div className="mt-5">{stats}</div> : null}
              </div>
            </div>
          </div>

          <div className="glass-card flex min-w-0 flex-col p-5 lg:p-6">
            <h2 className="text-xl font-black tracking-tight text-foreground">Find your next trip</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Group trips, stays, activities and rentals in one search.</p>
            <div className="mt-4 min-w-0 flex-1">{children}</div>
            {quickLinks && quickLinks.length > 0 ? (
              <div className="mt-4 border-t border-border/70 pt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quick picks</p>
                <div className="flex flex-wrap gap-2">
                  {quickLinks.map((q) => (
                    <Link
                      key={q.href}
                      href={q.href}
                      className="rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary hover:bg-primary/10"
                    >
                      {q.label}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        {belowHero ? <div className="mt-5">{belowHero}</div> : null}
      </div>
    </section>
  )
}
