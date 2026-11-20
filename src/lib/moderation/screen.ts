/**
 * Server-side screening for Tribe text (docs/revamp/product-spec.md §4, "Automatic checks").
 * Pure and synchronous so it is cheap to run on every post / comment and easy to test.
 */
export type ScreenPrompt = 'money' | 'contact_hidden' | 'links_disabled'

export type ScreenResult = {
  text: string
  prompts: ScreenPrompt[]
  /** true → store as status 'held' and queue for staff review. */
  hold: boolean
  flags: string[]
}

const CONTACT_HIDDEN = '[contact hidden]'

// Indian mobiles (+91 / 0 prefix, spaced or dashed), generic international numbers ≥ 10 digits.
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?){2,4}\d{2,5}/g
const UPI_RE = /\b[a-z0-9._-]{2,64}@(?:ok)?(?:upi|ybl|ibl|axl|paytm|apl|oksbi|okhdfcbank|okicici|okaxis|sbi|hdfcbank|icici|axisbank|kotak|yesbank|barodampay|unionbank|pnb|freecharge|jupiteraxis|fbl|airtel|waicici|wahdfcbank|waaxis|wasbi)\b/gi
const EMAIL_RE = /\b[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,24}\b/gi
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi
const MONEY_RE =
  /(?:₹|rs\.?|inr)\s?\d[\d,]*(?:\s?k)?\s*(?:\/|per)\s*(?:person|head|pax|seat)|\b(?:advance|token amount|booking amount|pay (?:me|us|now|in advance)|send (?:money|payment)|gpay|phonepe|paytm (?:me|number)|upi id)\b/i

// Small seed list; staff extend it via platform_settings in a later phase.
const BLOCKLIST = [
  /\b(?:nude|nudes|sex\s?chat|escort|hookup service)\b/i,
  /\b(?:kill (?:you|him|her)|rape)\b/i,
  /\b(?:randi|chutiya|madarchod|behenchod)\b/i,
]

function countDigits(s: string) {
  let n = 0
  for (const ch of s) if (ch >= '0' && ch <= '9') n++
  return n
}

const UNSOLO_HOST = /^(?:https?:\/\/)?(?:www\.)?unsolo\.in(?:\/|$)/i

export function screenText(input: string, opts: { allowMoney?: boolean } = {}): ScreenResult {
  const prompts = new Set<ScreenPrompt>()
  const flags: string[] = []
  let text = input.replace(/\u0000/g, '').trim()

  // Money language is checked on the original text (before UPI IDs are masked).
  const mentionsMoney = MONEY_RE.test(text) || UPI_RE.test(text)
  UPI_RE.lastIndex = 0

  text = text.replace(UPI_RE, () => { prompts.add('contact_hidden'); return CONTACT_HIDDEN })
  text = text.replace(EMAIL_RE, () => { prompts.add('contact_hidden'); return CONTACT_HIDDEN })
  text = text.replace(PHONE_RE, (m) => {
    // Only mask things that look like phone numbers (10–13 digits), not dates, prices or years.
    const d = countDigits(m)
    if (d >= 10 && d <= 13) { prompts.add('contact_hidden'); return CONTACT_HIDDEN }
    return m
  })
  text = text.replace(URL_RE, (m) => {
    if (UNSOLO_HOST.test(m)) return m
    prompts.add('links_disabled')
    // Break auto-linking while keeping the text readable.
    return m.replace(/^https?:\/\//i, '').replace(/\./g, '․')
  })

  let hold = false
  if (mentionsMoney && !opts.allowMoney) {
    prompts.add('money')
    flags.push('money')
    hold = true
  }
  if (BLOCKLIST.some((re) => re.test(text))) {
    flags.push('blocklist')
    hold = true
  }
  if (prompts.has('contact_hidden')) flags.push('contact_hidden')

  return { text, prompts: [...prompts], hold, flags }
}
