/** Canonical list for profile / stats UI (aligned with TravelStats). */
export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Delhi',
  'Jammu & Kashmir',
  'Ladakh',
  'Puducherry',
  'Chandigarh',
  'Andaman & Nicobar',
  'Lakshadweep',
] as const

/** Map booking / DB labels to @svg-maps/india `location.name` where names differ. */
export function canonicalStateLabel(state: string): string {
  const t = state.trim()
  if (t === 'Jammu & Kashmir') return 'Jammu and Kashmir'
  if (t === 'Andaman & Nicobar') return 'Andaman and Nicobar Islands'
  return t
}

/** Whether a raw visited state string from bookings matches an SVG region name. */
export function stateMatchesSvgName(visited: string, svgName: string): boolean {
  const v = visited.trim().toLowerCase()
  const s = svgName.trim().toLowerCase()
  if (!v || !s) return false
  if (v === s) return true
  if (canonicalStateLabel(visited).toLowerCase() === s) return true
  if (v === s.replace(/ and /g, ' & ')) return true
  if (
    (v.includes('jammu') || v.includes('kashmir') || v === 'ladakh') &&
    s.includes('jammu') &&
    s.includes('kashmir')
  ) {
    return true
  }
  if ((v.includes('andaman') || v.includes('nicobar')) && s.includes('andaman') && s.includes('nicobar')) {
    return true
  }
  return false
}

/** Whether a profile chip label (from INDIAN_STATES) is covered by any booking state string. */
export function visitedIncludesState(stateLabel: string, visitedStates: Iterable<string>): boolean {
  const target = stateLabel.trim()
  for (const raw of visitedStates) {
    const v = raw.trim()
    if (!v) continue
    if (v === target) return true
    if (canonicalStateLabel(v) === target) return true
    if (canonicalStateLabel(v) === canonicalStateLabel(target)) return true
  }
  if (target === 'Ladakh') {
    for (const raw of visitedStates) {
      if (raw.toLowerCase().includes('ladakh')) return true
    }
  }
  if (target === 'Jammu & Kashmir') {
    for (const raw of visitedStates) {
      const l = raw.toLowerCase()
      if (l.includes('jammu') && l.includes('kashmir')) return true
    }
  }
  if (target === 'Andaman & Nicobar') {
    for (const raw of visitedStates) {
      const l = raw.toLowerCase()
      if (l.includes('andaman') && l.includes('nicobar')) return true
    }
  }
  return false
}
