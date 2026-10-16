import { redirect } from 'next/navigation'
import { getRequestAuth } from '@/lib/auth/request-session'
import SettingsClient from './SettingsClient'
import { AdminPageHeader } from '@/components/admin/ui/AdminPrimitives'

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const { focus } = await searchParams
  const { supabase, user } = await getRequestAuth()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') redirect('/')

  const { data: settings } = await supabase
    .from('platform_settings')
    .select('*')
    .order('key')

  return (
    <div>
      <AdminPageHeader title="Settings" description="Platform-wide configuration." />
      <SettingsClient settings={settings || []} focusKey={focus} />
    </div>
  )
}
