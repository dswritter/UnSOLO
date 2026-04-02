import { redirect } from 'next/navigation'

export default async function ChatRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>
}) {
  const { roomId } = await params
  redirect(`/community/${roomId}`)
}
