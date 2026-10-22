import { getSupabaseAuthCookieOptions } from './auth-cookie-options'

export function clearBrowserSession() {
  const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]
  const key = `sb-${project}-auth-token`
  const { cookieOptions } = getSupabaseAuthCookieOptions()
  const names = document.cookie.split(';').map(cookie => cookie.trim().split('=')[0])
    .filter(name => name === key || name.startsWith(`${key}.`) || name === `${key}-code-verifier` || name === `${key}-user`)
  for (const name of names) {
    document.cookie = `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
    if (cookieOptions?.domain) {
      document.cookie = `${name}=; Path=/; Domain=${cookieOptions.domain}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; Secure`
    }
  }
}
