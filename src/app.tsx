import { Route, Routes, useParams } from 'react-router'
import { Reader } from './features/reader/components/reader'
import { ebookStore } from './features/ebook-list/lib/ebook-store'
import { EbookReaderPage } from './pages/ebook-reader-page'
import { EbookListPage } from './pages/ebook-list-page'

function EbookReaderRoute() {
  const { bookId } = useParams()
  if (!bookId || !ebookStore) return <EbookListPage />
  return <EbookReaderPage bookId={bookId} store={ebookStore} />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<EbookListPage />} />
      <Route path="/books/:bookId" element={<EbookReaderRoute />} />
      <Route
        path="/sample-reader"
        element={<Reader title="기본 PDF 리더 샘플" url="/samples/basic-reader.pdf" />}
      />
    </Routes>
  )
}

export default App
