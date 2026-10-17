'use client'

import Image from 'next/image'
import { useState } from 'react'
import { Mountain } from 'lucide-react'

const OPTIMIZED_IMAGE_HOSTS = [/\.supabase\.co$/, /^images\.unsplash\.com$/, /^lh3\.googleusercontent\.com$/, /^avatars\.githubusercontent\.com$/]

/** next/image only optimises allowlisted hosts; anything else (admin-pasted URLs) renders unoptimised. */
function canOptimize(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && OPTIMIZED_IMAGE_HOSTS.some(re => re.test(hostname))
  } catch {
    return false
  }
}

/** Cover photo that walks to the next candidate (then a gradient) when a URL is dead. */
export function WanderCoverImage({ src, fallbackSrc, sizes }: { src: string | null; fallbackSrc?: string | null; sizes: string }) {
  const candidates = [src, fallbackSrc].filter((url, i, all): url is string => !!url && all.indexOf(url) === i)
  const [failed, setFailed] = useState(0)
  const current = candidates[failed]
  if (!current) {
    return <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/25 via-primary/10 to-transparent">
      <Mountain className="h-10 w-10 text-primary/40" />
    </div>
  }
  return <Image key={current} src={current} alt="" fill sizes={sizes} unoptimized={!canOptimize(current)}
    onError={() => setFailed(n => n + 1)}
    className="object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none" />
}
