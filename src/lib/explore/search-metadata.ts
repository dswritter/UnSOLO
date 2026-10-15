const MAX_SEARCH_KEYWORDS = 40
const MAX_SEARCH_KEYWORD_LENGTH = 80

/** Normalize optional human-entered synonyms into compact searchable metadata. */
export function parseSearchKeywords(input: string): string[] {
  const seen = new Set<string>()
  const values: string[] = []
  for (const raw of input.split(/[,;\n]+/)) {
    const value = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_SEARCH_KEYWORD_LENGTH)
    const key = value.toLocaleLowerCase()
    if (!value || seen.has(key)) continue
    seen.add(key)
    values.push(value)
    if (values.length >= MAX_SEARCH_KEYWORDS) break
  }
  return values
}
