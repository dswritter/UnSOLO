import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check role — admins can upload package images, all users can upload avatars
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const purpose = (formData.get('purpose') as string) || 'package' // 'package' | 'avatar'

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  // Only admins can upload package images
  if (purpose === 'package' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only for package images' }, { status: 403 })
  }

  // Validate file type
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP, AVIF images allowed' }, { status: 400 })
  }

  // Max 5MB
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'File must be under 5MB' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() || 'jpg'
  const folder = purpose === 'avatar' ? 'avatars' : 'packages'
  const fileName = `${folder}/${user.id}-${Date.now()}.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())

  // Use service role client to bypass storage RLS
  const serviceClient = await createServiceClient()

  const { error } = await serviceClient.storage
    .from('images')
    .upload(fileName, buffer, {
      contentType: file.type,
      upsert: true,
    })

  if (error) {
    console.error('Storage upload error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: urlData } = serviceClient.storage.from('images').getPublicUrl(fileName)

  return NextResponse.json({ url: urlData.publicUrl })
}
