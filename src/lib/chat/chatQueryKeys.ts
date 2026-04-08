export function normalizeRoomId(id: string) {
  return id.trim().toLowerCase()
}

export const chatKeys = {
  messages: (roomId: string) => ['room', normalizeRoomId(roomId), 'messages'] as const,
}
