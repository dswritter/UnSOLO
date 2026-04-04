import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types'
import { AdminSidebar } from './AdminSidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, username')
    .eq('id', user.id)
    .single()

  const staffRoles: UserRole[] = ['admin', 'social_media_manager', 'field_person', 'chat_responder']
  if (!profile || !staffRoles.includes(profile.role as UserRole)) {
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <AdminSidebar
        role={profile.role as UserRole}
        name={profile.full_name || profile.username}
        userId={user.id}
      />

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-y-auto h-screen">
        <div className="px-6 lg:px-8 py-6">
          {children}
        </div>
      </main>
    </div>
  )
}
