import { redirect } from 'next/navigation'
import { getRequestAuth } from '@/lib/auth/request-session'
import PromoCardsClient from './PromoCardsClient'

export default async function AdminPromoCardsPage() {
  const { supabase, user } = await getRequestAuth()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') redirect('/')

  const { data: rows } = await supabase
    .from('landing_promo_cards')
    .select('*')
    .order('sort_order', { ascending: true })

  return (
    <div>
      <h1 className="text-2xl font-black mb-1">
        Home <span className="text-primary">promo cards</span>
      </h1>
      <p className="text-muted-foreground text-sm mb-6">
        Floating announcements on the landing page (offers, chat prompts, features). Timed windows optional.
      </p>
      <PromoCardsClient initial={rows || []} />
    </div>
  )
}
