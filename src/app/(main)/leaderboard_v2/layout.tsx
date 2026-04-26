/**
 * Fills the main column so the client can use flex-1 + min-h-0; only the rank table scrolls inside the client.
 */
export default function LeaderboardV2Layout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
}
