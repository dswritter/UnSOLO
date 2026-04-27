import { redirect } from 'next/navigation'

function searchParamsToQueryString(
  sp: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(sp)) {
    if (value === undefined) continue
    const arr = Array.isArray(value) ? value : [value]
    for (const v of arr) {
      params.append(key, v)
    }
  }
  return params.toString()
}

/** Preview route retired — same auth as /login. */
export default async function LoginV2Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const qs = searchParamsToQueryString(sp)
  redirect(qs ? `/login?${qs}` : '/login')
}
