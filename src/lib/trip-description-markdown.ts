/** Helpers for Markdown-style trip descriptions (subset: **bold**, ## headings, - bullets). */

export function lineStartIndex(text: string, cursor: number): number {
  const i = text.slice(0, cursor).lastIndexOf('\n')
  return i === -1 ? 0 : i + 1
}

export function lineEndIndex(text: string, cursor: number): number {
  const after = text.slice(cursor)
  const j = after.indexOf('\n')
  return j === -1 ? text.length : cursor + j
}

export function wrapBold(text: string, selStart: number, selEnd: number) {
  const inner = text.slice(selStart, selEnd) || 'emphasis'
  const next = text.slice(0, selStart) + '**' + inner + '**' + text.slice(selEnd)
  const start = selStart + 2
  const end = start + inner.length
  return { next, selStart: start, selEnd: end }
}

const HEADING_PREFIX = '## '

export function toggleHeadingLine(text: string, cursor: number) {
  const ls = lineStartIndex(text, cursor)
  const le = lineEndIndex(text, cursor)
  const line = text.slice(ls, le)
  let nextLine: string
  if (line.startsWith(HEADING_PREFIX)) {
    nextLine = line.slice(HEADING_PREFIX.length)
  } else {
    nextLine = HEADING_PREFIX + line
  }
  const next = text.slice(0, ls) + nextLine + text.slice(le)
  const pos = ls + nextLine.length
  return { next, selStart: pos, selEnd: pos }
}

const BULLET_PREFIX = '- '

export function toggleBulletLine(text: string, cursor: number) {
  const ls = lineStartIndex(text, cursor)
  const le = lineEndIndex(text, cursor)
  const line = text.slice(ls, le)
  let nextLine: string
  if (line.startsWith(BULLET_PREFIX)) {
    nextLine = line.slice(BULLET_PREFIX.length)
  } else {
    nextLine = BULLET_PREFIX + line
  }
  const next = text.slice(0, ls) + nextLine + text.slice(le)
  const pos = ls + nextLine.length
  return { next, selStart: pos, selEnd: pos }
}

/** Line range [rangeStart, rangeEnd) covering the selection (full lines when multi-line). */
function selectedLineBlockBounds(text: string, selStart: number, selEnd: number): { rangeStart: number; rangeEnd: number } {
  const a = Math.min(selStart, selEnd)
  const b = Math.max(selStart, selEnd)
  if (a === b) {
    const ls = lineStartIndex(text, a)
    const le = lineEndIndex(text, a)
    return { rangeStart: ls, rangeEnd: le }
  }
  const rangeStart = lineStartIndex(text, a)
  const rangeEnd = lineEndIndex(text, Math.max(a, b - 1))
  return { rangeStart, rangeEnd }
}

function mapBlockLines(
  block: string,
  allHavePrefix: (line: string) => boolean,
  strip: (line: string) => string,
  add: (line: string) => string,
): string {
  const rawLines = block.split('\n')
  const all = rawLines.length > 0 && rawLines.every(allHavePrefix)
  return rawLines.map((line) => (all ? strip(line) : add(line))).join('\n')
}

/** Toggle `- ` on every line in the selection at once (multi-line aware). */
export function toggleBulletRange(text: string, selStart: number, selEnd: number) {
  const a = Math.min(selStart, selEnd)
  const b = Math.max(selStart, selEnd)
  if (a === b) {
    return toggleBulletLine(text, a)
  }
  const { rangeStart, rangeEnd } = selectedLineBlockBounds(text, selStart, selEnd)
  const block = text.slice(rangeStart, rangeEnd)
  const newBlock = mapBlockLines(
    block,
    (line) => line.startsWith(BULLET_PREFIX),
    (line) => (line.startsWith(BULLET_PREFIX) ? line.slice(BULLET_PREFIX.length) : line),
    (line) => (line.startsWith(BULLET_PREFIX) ? line : BULLET_PREFIX + line),
  )
  const next = text.slice(0, rangeStart) + newBlock + text.slice(rangeEnd)
  const sel0 = rangeStart
  const sel1 = rangeStart + newBlock.length
  return { next, selStart: sel0, selEnd: sel1 }
}

/** Toggle `## ` on every line in the selection at once (multi-line aware). */
export function toggleHeadingRange(text: string, selStart: number, selEnd: number) {
  const a = Math.min(selStart, selEnd)
  const b = Math.max(selStart, selEnd)
  if (a === b) {
    return toggleHeadingLine(text, a)
  }
  const { rangeStart, rangeEnd } = selectedLineBlockBounds(text, selStart, selEnd)
  const block = text.slice(rangeStart, rangeEnd)
  const newBlock = mapBlockLines(
    block,
    (line) => line.startsWith(HEADING_PREFIX),
    (line) => (line.startsWith(HEADING_PREFIX) ? line.slice(HEADING_PREFIX.length) : line),
    (line) => (line.startsWith(HEADING_PREFIX) ? line : HEADING_PREFIX + line),
  )
  const next = text.slice(0, rangeStart) + newBlock + text.slice(rangeEnd)
  const sel0 = rangeStart
  const sel1 = rangeStart + newBlock.length
  return { next, selStart: sel0, selEnd: sel1 }
}
