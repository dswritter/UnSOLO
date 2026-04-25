import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { UPLOAD_MAX_IMAGE_BYTES, UPLOAD_IMAGE_TOO_LARGE_MESSAGE } from '@/lib/constants'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const purposeRaw = formData.get('purpose') as string | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_host')
    .eq('id', user.id)
    .single()

  const purposeTrim = purposeRaw?.trim() || null
  // UnSOLO package gallery = admin only. Verified hosts use host_trip (or we infer it when purpose is omitted).
  let purpose: string
  if (purposeTrim) {
    purpose = purposeTrim
  } else if (profile?.is_host === true && profile?.role !== 'admin') {
    purpose = 'host_trip'
  } else {
    purpose = 'package'
  }

  if (purpose === 'community_room') {
    if (profile?.role !== 'admin' && profile?.role !== 'social_media_manager') {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }
  }

  if (purpose === 'package' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only for package images' }, { status: 403 })
  }

  if (purpose === 'wander_hero' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only for wander hero' }, { status: 403 })
  }

  if (purpose === 'host_trip') {
    const allowed = profile?.is_host === true || profile?.role === 'admin'
    if (!allowed) {
      return NextResponse.json({ error: 'Host verification required to upload trip images' }, { status: 403 })
    }
  }

  // Validate file type
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP, AVIF images allowed' }, { status: 400 })
  }

  if (file.size > UPLOAD_MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: UPLOAD_IMAGE_TOO_LARGE_MESSAGE }, { status: 400 })
  }

  const ext = file.name.split('.').pop() || 'jpg'
  const folder =
    purpose === 'avatar'
      ? 'avatars'
      : purpose === 'community_room'
        ? 'community-rooms'
        : purpose === 'status_story'
          ? 'status-stories'
          : purpose === 'wander_hero'
            ? 'wander-hero'
            : purpose === 'host_trip'
              ? 'host-trips'
              : 'packages'
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
