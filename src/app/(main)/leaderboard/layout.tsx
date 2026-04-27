/**
 * Fills the main column: h-0 + flex-1 so height is the flex-allocated band (not content-sized).
 * LeaderboardV2Client uses a fixed under-nav scroll region for the full page column.
 */
export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex h-0 w-full min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
}
