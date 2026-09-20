import { createContext, useContext, useState, type ReactNode } from 'react'
import { ArrowRight, BookOpenText } from 'lucide-react'
import type { DataMessagePartComponent } from '@assistant-ui/react'
import type { SearchChunkSource } from '@/features/ebook-list/ebook-types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CardDescription } from '@/components/ui/card'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { isBookEvidenceData } from '../lib/rag/book-evidence'

type EvidenceNavigate = (source: SearchChunkSource) => void

const EvidenceNavigationContext = createContext<EvidenceNavigate | undefined>(undefined)

export function BookEvidenceNavigationProvider({
  children,
  onNavigate,
}: {
  children: ReactNode
  onNavigate?: EvidenceNavigate
}) {
  return (
    <EvidenceNavigationContext.Provider value={onNavigate}>
      {children}
    </EvidenceNavigationContext.Provider>
  )
}

export const BookEvidence: DataMessagePartComponent = ({ data }) => {
  const onNavigate = useContext(EvidenceNavigationContext)
  const [open, setOpen] = useState(false)
  if (!isBookEvidenceData(data) || data.chunks.length === 0) return null

  return (
    <div className="mt-3 border-t pt-2">
      <HoverCard onOpenChange={setOpen} open={open}>
        <HoverCardTrigger
          delay={150}
          render={<Button aria-label="근거 보기" size="sm" type="button" variant="link" />}
        >
          <BookOpenText data-icon="inline-start" />
          근거 보기
        </HoverCardTrigger>
        <HoverCardContent
          align="start"
          className="max-h-80 overflow-y-auto"
          side="top"
          variant="list"
        >
          <ol className="flex flex-col gap-2">
            {data.chunks.map((chunk, index) => {
              const source = chunk.sources[0]
              if (!source) return null
              return (
                <li key={chunk.id}>
                  <Button
                    aria-label={`${source.pageNumber}페이지 근거로 이동`}
                    className="h-auto min-h-14 w-full justify-start gap-3 px-3 py-2.5 text-left whitespace-normal"
                    disabled={!onNavigate}
                    onClick={() => {
                      setOpen(false)
                      onNavigate?.(source)
                    }}
                    type="button"
                    variant="outline"
                  >
                    <span className="sr-only">근거 {index + 1}</span>
                    <Badge variant="secondary">p.{source.pageNumber}</Badge>
                    <CardDescription className="line-clamp-2 min-w-0 flex-1 text-left whitespace-pre-wrap">
                      {chunk.text}
                    </CardDescription>
                    <ArrowRight aria-hidden="true" data-icon="inline-end" />
                  </Button>
                </li>
              )
            })}
          </ol>
        </HoverCardContent>
      </HoverCard>
    </div>
  )
}
