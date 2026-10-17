import { NextRequest, NextResponse } from 'next/server'
import { loadMoreSidebarRooms } from '@/actions/chat-sidebar'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const offset = Number(params.get('offset') ?? 0)
  const type = params.get('type')
  if (!Number.isSafeInteger(offset) || offset < 0 || (type !== null && type !== 'direct' && type !== 'trip' && type !== 'general')) {
    return NextResponse.json({ error: 'Invalid conversation filter or offset' }, { status: 400 })
  }
  const result = await loadMoreSidebarRooms(offset, type ?? undefined)
  return NextResponse.json(result, {
    status: result.error ? 401 : 200,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
