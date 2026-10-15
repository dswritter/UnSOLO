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
}: {
  heroImageUrl: string
  trustBadgeText: string
  heroCopy: WanderHeroCopy
  children?: ReactNode
  belowHero?: ReactNode
  proofCard?: ReactNode
}) {
  const desktopTypography = heroCopy.desktopTypography
  const badgeStyle: CSSProperties | undefined = desktopTypography.badgeSize ? { fontSize: desktopTypography.badgeSize } : undefined
  const headlineStyle: CSSProperties | undefined = desktopTypography.headlineSize ? { fontSize: desktopTypography.headlineSize } : undefined
  const subtitleStyle: CSSProperties | undefined = desktopTypography.subtitleSize ? { fontSize: desktopTypography.subtitleSize } : undefined
  const instagramStyle: CSSProperties | undefined = desktopTypography.instagramSize ? { fontSize: desktopTypography.instagramSize } : undefined

  const headlineInner = (
    <h1 className="text-3xl font-black leading-[1.08] tracking-tight text-white sm:text-5xl md:text-6xl md:leading-[1.02]" style={headlineStyle}>
      {heroCopy.line1}
      <br />
      {heroCopy.line2Before}
      <span className="text-primary">{heroCopy.line2Accent}</span>
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
    <p className="mt-3 max-w-2xl text-sm text-white/80 md:text-base" style={subtitleStyle}>{heroCopy.subtitle}</p>
  )
  if (heroCopy.subtitleLink) {
    const subCls =
      'mt-3 inline-block max-w-2xl text-sm text-white/80 md:text-base rounded-lg outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary'
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
    'glass-card flex w-full flex-col gap-2 p-2.5 text-left text-white transition-transform duration-200 hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
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
    <section className="relative w-full min-h-0 overflow-hidden bg-background">
      <div className="absolute inset-0">
        <Image
          src={heroImageUrl}
          alt=""
          fill
          // LCP image — fetch it ahead of below-the-fold work.
          priority
          sizes="100vw"
          // Admin can set this to any HTTPS host; only optimize (resize/reformat)
          // when it's on a host next.config.ts's remotePatterns allows.
          unoptimized={!isOptimizableImageUrl(heroImageUrl)}
          className="object-cover object-center opacity-95"
        />
        {/*
          Readability scrim on the left where copy + search live; right stays mostly the photo
          (neutral vignette only, no heavy brand-green wash).
        */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-[min(100%,60rem)] bg-gradient-to-r from-background/92 from-[8%] via-background/45 via-[48%] to-transparent to-[100%]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-0 left-0 h-[42%] w-[min(100%,70rem)] bg-gradient-to-t from-background/30 to-transparent [mask-image:linear-gradient(90deg,#000_0%,#000_50%,transparent_88%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-[min(100%,50%)] max-w-2xl bg-gradient-to-l from-black/10 from-[15%] to-transparent to-100%"
          aria-hidden
        />
      </div>

      <div
        className={
          belowHero
            ? 'relative z-20 mx-auto w-full max-w-[min(100%,1920px)] px-4 pt-5 pb-2 sm:px-6 md:pt-6 md:pb-2 lg:px-10'
            : 'relative z-10 mx-auto w-full max-w-[min(100%,1920px)] px-4 pb-4 pt-5 sm:px-6 md:pb-5 md:pt-6 lg:px-10'
        }
      >
        <div className="grid min-h-[min(100%,clamp(300px,48vh,560px))] grid-cols-1 gap-4 lg:min-h-[clamp(300px,44vh,520px)] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-stretch">
          <div className="flex min-h-0 min-w-0 flex-col justify-between gap-3">
            <div className="min-w-0 self-start max-w-3xl">
              <p
                className="mb-3 inline-flex w-fit max-w-[min(100%,42rem)] items-start gap-2 rounded-lg border border-primary/30 bg-primary/8 px-3 py-2 text-left text-xs font-medium leading-snug text-white shadow-sm backdrop-blur-[40px] backdrop-saturate-150 ring-1 ring-white/5 sm:text-[13px]"
                style={badgeStyle}
              >
                <ShieldCheck
                  className="h-4 w-4 shrink-0 text-[#fcba03] mt-0.5"
                  strokeWidth={2}
                  aria-hidden
                />
                <span>{trustBadgeText}</span>
              </p>
              {headlineBlock}
              {subtitleBlock}
            </div>
            {children ? (
              <div className="w-full min-w-0 max-w-[min(100%,52.8rem)] pt-0">{children}</div>
            ) : null}
          </div>

          <div className="flex min-w-0 items-end justify-end self-stretch sm:min-h-[7rem]">
            <div className="flex w-[8.5rem] shrink-0 flex-col items-stretch gap-2.5">
              {instagramCta}
              {proofCard}
            </div>
          </div>
        </div>
      </div>
      {belowHero ? (
        <div className="relative z-0 mx-auto w-full max-w-[min(100%,1920px)] px-4 pb-4 pt-0 sm:px-6 md:pb-5 lg:px-10">
          {belowHero}
        </div>
      ) : null}
    </section>
  )
}
