import { useEffect } from 'react'
import { Route, Routes, useParams } from 'react-router'
import { ReaderPage } from './reader-page'
import { ebookStore } from '@/lib/ebook/storage/connection'
import { prepareOcr } from '@/lib/pdf/ocr/recognize-page'
import { prepareCachedWebLlmModel } from '../features/chat/lib/web-llm/model'
import { EbookReaderPage } from '../pages/ebook-reader-page'
import { BookshelfPage } from '../pages/bookshelf-page'
import { OcrConsolePage } from '../pages/ocr-console-page'
import { PrivacyPolicyPage } from '../pages/privacy-policy-page'
import { TermsOfServicePage } from '../pages/terms-of-service-page'
import { OpenSourceLicensesPage } from '../pages/open-source-licenses-page'

function EbookReaderRoute() {
  const { bookId } = useParams()
  if (!bookId || !ebookStore) return <BookshelfPage />
  return <EbookReaderPage key={bookId} bookId={bookId} store={ebookStore} />
}

function ReadingRoutes() {
  useEffect(() => {
    prepareOcr().catch(() => undefined)
    prepareCachedWebLlmModel().catch((error: unknown) => {
      console.warn('저장된 채팅 모델을 미리 준비하지 못했습니다.', error)
    })
  }, [])

  return (
    <Routes>
      <Route path="/library" element={<BookshelfPage />} />
      <Route path="/books/:bookId" element={<EbookReaderRoute />} />
      <Route path="/console" element={<OcrConsolePage store={ebookStore} />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsOfServicePage />} />
      <Route path="/licenses" element={<OpenSourceLicensesPage />} />
      <Route
        path="/sample-reader"
        element={<ReaderPage title="기본 PDF 리더 샘플" url="/samples/basic-reader.pdf" />}
      />
    </Routes>
  )
}

export default ReadingRoutes
