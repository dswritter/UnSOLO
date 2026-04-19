'use client'

import ReactMarkdown from 'react-markdown'

/**
 * Renders trip/package description stored as Markdown (bold, ## headings, lists).
 * Falls back gracefully for plain text.
 */
export function TripDescriptionDisplay({
  children,
  className,
}: {
  children: string
  className?: string
}) {
  const raw = children?.trim()
  if (!raw) return null

  return (
    <div className={className}>
      <ReactMarkdown
        components={{
          h2: ({ children }) => (
            <h2 className="text-lg font-bold text-foreground mt-5 mb-2 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-foreground mt-4 mb-1.5">{children}</h3>
          ),
          p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc pl-5 mb-3 space-y-1 last:mb-0 text-muted-foreground">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 mb-3 space-y-1 last:mb-0 text-muted-foreground">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
