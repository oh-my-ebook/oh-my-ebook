import type { ChatModelAdapter } from '@assistant-ui/react'
import { ReaderChat } from '@/features/chat/components/reader-chat'
import type { SearchChunks } from '@/features/chat/lib/rag/search-book-chunks'
import type { BookAnalysisStatus } from '@/features/bookshelf/ebook-types'
import { Reader, type ReaderProps } from '@/features/reader/components/reader'
import type { BookMetadata } from '@/lib/book-metadata'

interface ReaderPageProps extends Omit<ReaderProps, 'renderPanel'> {
  analysisStatus?: BookAnalysisStatus
  bookId?: string
  bookMetadata?: BookMetadata
  chatModel?: ChatModelAdapter
  searchChunks?: SearchChunks
}

export function ReaderPage({
  analysisStatus,
  bookId,
  bookMetadata,
  chatModel,
  searchChunks,
  ...readerProps
}: ReaderPageProps) {
  return (
    <Reader
      {...readerProps}
      renderPanel={(context) => (
        <ReaderChat
          {...context}
          analysisStatus={analysisStatus}
          bookId={bookId}
          bookMetadata={bookMetadata}
          chatModel={chatModel}
          key={readerProps.url}
          searchChunks={searchChunks}
        />
      )}
    />
  )
}
