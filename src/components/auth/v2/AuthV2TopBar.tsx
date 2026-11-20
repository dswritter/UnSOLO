import Link from 'next/link'

/** Original wordmark styling at a smaller size so it doesn't compete with the headline. */
export function AuthV2TopBar() {
  return (
    <div className="flex items-center">
      <Link href="/" aria-label="UnSOLO home" className="pc-wordmark text-[18px]">
        <b>UN</b>SOLO
      </Link>
    </div>
  )
}
