'use client'

import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react'
import { ChatWindow, type ChatMemberProfile } from '@/components/chat/ChatWindow'
import type { ChatLinkTarget } from '@/lib/chat/chatHashTags'
import type { ChatPollState } from '@/lib/chat/getRoomPollsState'
import type { Message, Profile } from '@/types'

export type TribeRoomHydrationPayload = {
  memberProfiles: ChatMemberProfile[]
  chatLinkTargets: ChatLinkTarget[]
  pinnedMessage: Message | null
  initialPollsByMessageId: Record<string, ChatPollState>
}

const HydrationDispatch = createContext<((p: TribeRoomHydrationPayload) => void) | null>(null)

type CoordinatorProps = {
  roomId: string
  roomName: string
  roomType: 'trip' | 'general' | 'direct'
  roomImageUrl: string | null
  currentUser: Profile
  bootstrapMemberProfiles: ChatMemberProfile[]
  chatListPath: string
  tripHostUserId?: string | null
  hydrator: ReactNode
}

export function TribeRoomCoordinator({
  roomId,
  roomName,
  roomType,
  roomImageUrl,
  currentUser,
  bootstrapMemberProfiles,
  chatListPath,
  tripHostUserId = null,
  hydrator,
}: CoordinatorProps) {
  const [hydration, setHydration] = useState<TribeRoomHydrationPayload | null>(null)

  return (
    <HydrationDispatch.Provider value={setHydration}>
      <ChatWindow
        roomId={roomId}
        roomName={roomName}
        roomType={roomType}
        roomImageUrl={roomImageUrl}
        initialMessages={[]}
        currentUser={currentUser}
        memberProfiles={hydration?.memberProfiles ?? bootstrapMemberProfiles}
        chatLinkTargets={hydration?.chatLinkTargets ?? []}
        pinnedMessage={hydration?.pinnedMessage ?? null}
        initialPollsByMessageId={hydration?.initialPollsByMessageId ?? {}}
        chatListPath={chatListPath}
        tribeShell
        tripHostUserId={tripHostUserId}
      />
      {hydrator}
    </HydrationDispatch.Provider>
  )
}

export function TribeRoomApplyHydration({ payload }: { payload: TribeRoomHydrationPayload }) {
  const dispatch = useContext(HydrationDispatch)
  useLayoutEffect(() => {
    dispatch?.(payload)
  }, [dispatch, payload])
  return null
}
