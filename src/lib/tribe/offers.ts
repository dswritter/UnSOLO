import { PROFILE_LITE } from './models'

export const HOST_OFFER_SELECT = `id, post_id, price_paise, includes, notes, extra_seats, state, expires_at, pay_by,
  host:profiles!host_offers_host_id_fkey(${PROFILE_LITE}), package:packages(slug)`
