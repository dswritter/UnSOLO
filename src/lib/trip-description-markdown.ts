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
