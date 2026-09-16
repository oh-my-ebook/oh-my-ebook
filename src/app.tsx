import { Route, Routes } from 'react-router'
import { Reader } from './features/reader/components/reader'
import { EbookListPage } from './pages/ebook-list-page'

function App() {
  return (
    <Routes>
      <Route path="/" element={<EbookListPage />} />
      <Route
        path="/sample-reader"
        element={<Reader title="기본 PDF 리더 샘플" url="/samples/basic-reader.pdf" />}
      />
    </Routes>
  )
}

export default App
