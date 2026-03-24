import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SettingsClient from './SettingsClient'

export default async function AdminSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') redirect('/')

  const { data: settings } = await supabase
    .from('platform_settings')
    .select('*')
    .order('key')

  return (
    <div>
      <h1 className="text-2xl font-black mb-1">Platform <span className="text-primary">Settings</span></h1>
      <p className="text-muted-foreground text-sm mb-6">Manage platform-wide configuration</p>
      <SettingsClient settings={settings || []} />
    </div>
  )
}
