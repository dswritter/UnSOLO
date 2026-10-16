import { redirect } from 'next/navigation'
import { getRequestAuth } from '@/lib/auth/request-session'
import PromoCardsClient from './PromoCardsClient'
import { AdminPageHeader } from '@/components/admin/ui/AdminPrimitives'

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
      <AdminPageHeader title="Home promos" description="Floating announcements on the landing page, optionally time-boxed." />
      <PromoCardsClient initial={rows || []} />
    </div>
  )
}
