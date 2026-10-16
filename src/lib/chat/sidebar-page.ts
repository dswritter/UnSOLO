export function prioritizeActiveConversation<T extends { id: string }>(rooms: T[], activeRoomId: string | null): T[] {
  const active = rooms.find(room => room.id === activeRoomId)
  return active ? [active, ...rooms.filter(room => room.id !== activeRoomId)] : rooms
}
