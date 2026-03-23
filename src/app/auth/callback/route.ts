import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/explore'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Ensure profile exists
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .single()

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

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
