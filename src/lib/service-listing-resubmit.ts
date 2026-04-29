/**
 * Whether the host may resubmit after a previous `last_host_resubmit_at` submit.
 * Requires the listing `updated_at` or any item activity to be strictly after last resubmit.
 */
export function hostMayResubmitServiceListing(opts: {
  last_host_resubmit_at: string | null | undefined
  listing_updated_at: string | null | undefined
  maxItemActivityMs: number
}): boolean {
  const last = opts.last_host_resubmit_at
  if (!last) return true
  const lr = new Date(last).getTime()
  const lu = opts.listing_updated_at ? new Date(opts.listing_updated_at).getTime() : 0
  return lu > lr || opts.maxItemActivityMs > lr
}
