/**
 * Green / gold themed shell aligned with /leaderboard. Scrollable full page (not fixed layout).
 * `dark` forces dark design tokens for this subtree so outline buttons, cards, and muted text stay
 * readable when the rest of the app (html) is in system light mode.
 */
export function ProfileV2Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="dark app-profile-v2 relative min-h-dvh w-full text-white [color-scheme:dark]"
      data-profile-theme="v2"
    >
      <div
        className="pointer-events-none fixed inset-0 z-0 [background:radial-gradient(ellipse_90%_70%_at_12%_-10%,rgba(34,197,94,0.22)0%,transparent_52%),radial-gradient(ellipse_60%_50%_at_85%_40%,rgba(6,78,59,0.45)0%,transparent_50%),radial-gradient(ellipse_50%_40%_at_50%_100%,rgba(4,40,32,0.35)0%,transparent_45%)]"
        aria-hidden
      />
      <div
        className="fixed inset-0 z-0 bg-gradient-to-b from-[#0c1814] via-[#08120f] to-[#040806]"
        aria-hidden
      />
      <div className="relative z-[1] min-h-dvh w-full">{children}</div>
    </div>
  )
}
