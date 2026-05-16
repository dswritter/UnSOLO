import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  UPLOAD_MAX_IMAGE_BYTES,
  UPLOAD_IMAGE_TOO_LARGE_MESSAGE,
  UPLOAD_WEBP_FULL_MAX_WIDTH,
  UPLOAD_WEBP_THUMB_MAX_WIDTH,
} from '@/lib/constants'

export const runtime = 'nodejs'

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

  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP, AVIF images allowed' }, { status: 400 })
  }

  if (file.size > UPLOAD_MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: UPLOAD_IMAGE_TOO_LARGE_MESSAGE }, { status: 400 })
  }

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

  const base = `${folder}/${user.id}-${Date.now()}`
  const fullKey = `${base}.webp`
  const thumbKey = `${base}_thumb.webp`

  const buffer = Buffer.from(await file.arrayBuffer())

  let fullBuf: Buffer
  let thumbBuf: Buffer
  try {
    const rotated = sharp(buffer).rotate()
    ;[fullBuf, thumbBuf] = await Promise.all([
      rotated
        .clone()
        .resize({
          width: UPLOAD_WEBP_FULL_MAX_WIDTH,
          height: UPLOAD_WEBP_FULL_MAX_WIDTH,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 86, effort: 4 })
        .toBuffer(),
      sharp(buffer)
        .rotate()
        .resize({
          width: UPLOAD_WEBP_THUMB_MAX_WIDTH,
          height: UPLOAD_WEBP_THUMB_MAX_WIDTH,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80, effort: 4 })
        .toBuffer(),
    ])
  } catch (e) {
    console.error('Image processing error:', e)
    return NextResponse.json({ error: 'Could not process this image. Try a different file.' }, { status: 400 })
  }

  const serviceClient = await createServiceClient()

  const { error: fullErr } = await serviceClient.storage.from('images').upload(fullKey, fullBuf, {
    contentType: 'image/webp',
    upsert: true,
  })
  if (fullErr) {
    console.error('Storage upload error (full):', fullErr)
    return NextResponse.json({ error: fullErr.message }, { status: 500 })
  }

  const { error: thumbErr } = await serviceClient.storage.from('images').upload(thumbKey, thumbBuf, {
    contentType: 'image/webp',
    upsert: true,
  })
  if (thumbErr) {
    console.error('Storage upload error (thumb):', thumbErr)
    try {
      await serviceClient.storage.from('images').remove([fullKey])
    } catch {
      /* best-effort cleanup */
    }
    return NextResponse.json({ error: thumbErr.message }, { status: 500 })
  }

  const { data: fullUrl } = serviceClient.storage.from('images').getPublicUrl(fullKey)
  const { data: thumbUrl } = serviceClient.storage.from('images').getPublicUrl(thumbKey)

  return NextResponse.json({ url: fullUrl.publicUrl, thumbUrl: thumbUrl.publicUrl })
}
