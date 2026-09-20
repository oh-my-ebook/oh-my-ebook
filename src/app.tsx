import { useEffect } from 'react'
import { Route, Routes, useParams } from 'react-router'
import { Reader } from './features/reader/components/reader'
import { ebookStore } from './features/ebook-list/lib/ebook-store'
import { prepareOcr } from './features/reader/lib/ocr/page-recognition'
import { EbookReaderPage } from './pages/ebook-reader-page'
import { EbookListPage } from './pages/ebook-list-page'
import { OcrConsolePage } from './pages/ocr-console-page'

function EbookReaderRoute() {
  const { bookId } = useParams()
  if (!bookId || !ebookStore) return <EbookListPage />
  return <EbookReaderPage key={bookId} bookId={bookId} store={ebookStore} />
}

function App() {
  useEffect(() => {
    prepareOcr().catch(() => undefined)
  }, [])

  return (
    <Routes>
      <Route path="/" element={<EbookListPage />} />
      <Route path="/books/:bookId" element={<EbookReaderRoute />} />
      <Route path="/console" element={<OcrConsolePage store={ebookStore} />} />
      <Route
        path="/sample-reader"
        element={<Reader title="기본 PDF 리더 샘플" url="/samples/basic-reader.pdf" />}
      />
    </Routes>
  )
}

export default App
