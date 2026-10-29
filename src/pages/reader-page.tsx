import type { ChatModelAdapter } from '@assistant-ui/react'
import type { BookAnalysisStatus, BookInfo } from '@/lib/ebook-storage/types/book'
import { ReaderChat } from '@/features/chat/components/reader-chat'
import type { SearchChunks } from '@/features/chat/lib/rag/search-book-chunks'
import { Reader, type ReaderProps } from '@/features/reader/components/reader'

interface ReaderPageProps extends Omit<ReaderProps, 'renderPanel'> {
  analysisStatus?: BookAnalysisStatus
  bookId?: string
  bookInfo?: BookInfo
  chatModel?: ChatModelAdapter
  searchChunks?: SearchChunks
}

export function ReaderPage({
  analysisStatus,
  bookId,
  bookInfo,
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
          bookInfo={bookInfo}
          chatModel={chatModel}
          key={readerProps.url}
          searchChunks={searchChunks}
        />
      )}
    />
  )
}
