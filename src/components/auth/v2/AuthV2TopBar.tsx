import Link from 'next/link'

/** Logo only — no nav, no language selector. */
export function AuthV2TopBar() {
  return (
    <div className="flex items-center">
      <Link href="/" className="text-lg font-black tracking-tight text-white sm:text-xl">
        UNSOLO
      </Link>
    </div>
  )
}
