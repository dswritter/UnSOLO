import { redirect } from 'next/navigation'
import { getRequestAuth } from '@/lib/auth/request-session'
import { AdminPageHeader } from '@/components/admin/ui/AdminPrimitives'
import { listPromotions, countPromotionAudience } from '@/actions/promotions'
import PromotionsClient from './PromotionsClient'

export const dynamic = 'force-dynamic'

export default async function AdminPromotionsPage() {
  const { supabase, user } = await getRequestAuth()
  if (!user) redirect('/login?redirectTo=%2Fadmin%2Fpromotions')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') redirect('/admin')
  const [sent, optedIn] = await Promise.all([listPromotions(), countPromotionAudience('all')])
  return (
    <div>
      <AdminPageHeader
        title="Push promotions"
        description="Send a deal or announcement to phones and browsers. Only people who turned on “Offers and news” get it; it also shows in their Activity."
      />
      <PromotionsClient initialSent={sent} optedIn={optedIn} />
    </div>
  )
}
