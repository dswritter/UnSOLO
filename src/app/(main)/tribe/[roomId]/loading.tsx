import { TribeMainPaneSkeleton } from '@/components/chat/TribeMainPaneSkeleton'

export default function TribeRoomLoading() {
  return (
    <div className="flex flex-col h-full min-h-0 flex-1 bg-transparent">
      <TribeMainPaneSkeleton className="flex-1 min-h-0 border-0 rounded-none" />
    </div>
  )
}
