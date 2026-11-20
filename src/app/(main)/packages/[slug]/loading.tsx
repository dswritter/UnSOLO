import { DetailPreviewLoading } from '@/components/listings/DetailPreviewLoading'

/** Mobile: cover + ring placeholder matching the trip page; desktop keeps the generic detail skeleton. */
export default function PackageDetailLoading() {
  return (
    <>
      <div className="md:hidden" aria-busy="true" aria-label="Loading trip">
        <div className="pc-skel h-[42svh] min-h-[280px] rounded-none" />
        <div className="relative -mt-[104px] grid place-items-center">
          <div className="h-[208px] w-[208px] rounded-full border-[6px] border-[color:var(--pc-paper)] bg-[color:var(--pc-tonal)]" />
        </div>
        <div className="mx-auto mt-5 flex w-3/4 flex-col items-center gap-2.5">
          <div className="pc-skel h-7 w-full" />
          <div className="pc-skel h-4 w-2/3" />
        </div>
      </div>
      <div className="hidden md:block"><DetailPreviewLoading label="trip" /></div>
    </>
  )
}
