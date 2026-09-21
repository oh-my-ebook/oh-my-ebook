import { createContext, useContext, useState, type ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import type { DataMessagePartComponent } from '@assistant-ui/react'
import { Sources } from '@/components/assistant-ui/elements/sources.aui'
import type { SearchChunkResult, SearchChunkSource } from '@/features/ebook-list/ebook-types'
import { Button } from '@/components/ui/button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { isBookCitationsData } from '../lib/rag/book-citations'

type CitationNavigate = (source: SearchChunkSource) => void

const CitationNavigationContext = createContext<CitationNavigate | undefined>(undefined)

export function BookCitationNavigationProvider({
  children,
  onNavigate,
}: {
  children: ReactNode
  onNavigate?: CitationNavigate
}) {
  return (
    <CitationNavigationContext.Provider value={onNavigate}>
      {children}
    </CitationNavigationContext.Provider>
  )
}

function BookCitationItem({
  chunk,
  onNavigate,
}: {
  chunk: SearchChunkResult
  onNavigate?: CitationNavigate
}) {
  const [open, setOpen] = useState(false)
  const source = chunk.sources[0]
  if (!source) return null

  return (
    <HoverCard onOpenChange={setOpen} open={open}>
      <HoverCardTrigger
        delay={150}
        render={
          <button
            aria-label={`${source.pageNumber}페이지 인용 출처`}
            className="rounded-4xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            type="button"
          />
        }
      >
        <Sources
          id={chunk.id}
          mediaType="application/pdf"
          sourceType="document"
          status={{ type: 'complete' }}
          title={`p.${source.pageNumber}`}
          type="source"
        />
      </HoverCardTrigger>
      <HoverCardContent align="start" className="flex flex-col gap-3" side="bottom">
        <p className="line-clamp-4 whitespace-pre-wrap">{chunk.text}</p>
        <Button
          className="w-full"
          disabled={!onNavigate}
          onClick={() => {
            setOpen(false)
            onNavigate?.(source)
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {source.pageNumber}페이지 원문으로 이동
          <ArrowRight aria-hidden="true" data-icon="inline-end" />
        </Button>
      </HoverCardContent>
    </HoverCard>
  )
}

export const BookCitations: DataMessagePartComponent = ({ data }) => {
  const onNavigate = useContext(CitationNavigationContext)
  if (!isBookCitationsData(data) || data.chunks.length === 0) return null

  return (
    <div aria-label="답변 인용 출처" className="mt-2 flex flex-wrap items-center gap-1.5">
      {data.chunks.map((chunk) => (
        <BookCitationItem chunk={chunk} key={chunk.id} onNavigate={onNavigate} />
      ))}
    </div>
  )
}
