export const dynamic = 'force-static'
export const metadata = { title: 'Offline · UnSOLO', robots: { index: false } }

export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <span className="pc-wordmark text-2xl"><b>UN</b>SOLO</span>
      <h1 className="mt-6 text-2xl">You&apos;re offline</h1>
      <p className="mt-2 text-muted-foreground">Anything you post now is saved on this device and goes out when you&apos;re back online.</p>
    </div>
  )
}
