import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import { getSupabaseAuthCookieOptions } from '@/lib/supabase/auth-cookie-options'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next')
  const next = nextParam?.startsWith('/') ? nextParam : '/'
  const successResponse = NextResponse.redirect(`${origin}${next}`)
  const failureResponse = NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        ...getSupabaseAuthCookieOptions(),
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
              successResponse.cookies.set(name, value, options)
              failureResponse.cookies.set(name, value, options)
            })
          },
        },
      },
    )
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Ensure profile exists
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle()

      if (!existing) {
        const email = data.user.email || ''
        const username = email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase() + Math.floor(Math.random() * 999)
        await supabase.from('profiles').insert({
          id: data.user.id,
          username,
          full_name: data.user.user_metadata?.full_name || data.user.user_metadata?.name || username,
          avatar_url: data.user.user_metadata?.avatar_url || null,
        })

        // Link referral if code was passed via OAuth metadata
        const refCode = data.user.user_metadata?.referral_code
        if (refCode) {
          const { linkReferral } = await import('@/actions/auth')
          await linkReferral(data.user.id, refCode)
        }
      }

      return successResponse
    }
  }

  return failureResponse
}
