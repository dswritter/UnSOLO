export type ChatLinkTarget = { roomId: string; slug: string; label: string }

export function hashtagSlugFromRoomName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Match user-typed fragment after # (may include spaces) to a room/trip link target */
export function matchChatHashtag(fragment: string, targets: ChatLinkTarget[]): ChatLinkTarget | null {
  const raw = fragment.trimEnd()
  if (!raw) return null
  const q = raw.toLowerCase()
  const qSlug = hashtagSlugFromRoomName(raw)

  const bySlugExact = targets.find(t => t.slug.toLowerCase() === qSlug)
  if (bySlugExact) return bySlugExact

  const byLabelExact = targets.find(t => t.label.trim().toLowerCase() === q)
  if (byLabelExact) return byLabelExact

  const slugPrefixHits = targets.filter(t => {
    const s = t.slug.toLowerCase()
    return s === qSlug || (qSlug.length >= 2 && s.startsWith(qSlug + '-'))
  })
  if (slugPrefixHits.length === 1) return slugPrefixHits[0]

  const labelPrefixHits = targets.filter(t => {
    const l = t.label.toLowerCase()
    if (l === q) return true
    if (q.length >= 2 && l.startsWith(q + ' ')) return true
    if (q.length >= 4 && l.startsWith(q)) return true
    return false
  })
  if (labelPrefixHits.length === 1) return labelPrefixHits[0]

  return null
}

/** Longest-first consume after # for rendering */
export function consumeHashtagFragment(
  textAfterHash: string,
  targets: ChatLinkTarget[],
): { target: ChatLinkTarget; consumed: number } | null {
  const max = Math.min(textAfterHash.length, 100)
  for (let len = max; len >= 1; len--) {
    const frag = textAfterHash.slice(0, len)
    if (frag.endsWith(' ') && frag.trim().length === 0) continue
    const m = matchChatHashtag(frag, targets)
    if (m) return { target: m, consumed: len }
  }
  return null
}
