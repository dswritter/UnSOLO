import Link from 'next/link'

/** Original wordmark styling at a smaller size so it doesn't compete with the headline. */
export function AuthV2TopBar() {
  return (
    <div className="flex items-center">
      <Link href="/" aria-label="Unsolo home"
        className="text-base font-black tracking-tight text-foreground sm:text-lg">
        <span className="brand-gold">UN</span>SOLO
      </Link>
    </div>
  )
}
