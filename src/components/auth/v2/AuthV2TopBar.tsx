import Link from 'next/link'

/** Small letter-spaced wordmark so it reads as a logo, not a second headline. */
export function AuthV2TopBar() {
  return (
    <div className="flex items-center">
      <Link href="/" aria-label="Unsolo home"
        className="text-[13px] font-black uppercase tracking-[0.28em] text-foreground/90 sm:text-sm">
        <span className="brand-gold">UN</span>SOLO
      </Link>
    </div>
  )
}
