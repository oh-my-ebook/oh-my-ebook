import { useEffect, useState } from 'react'
import { Outlet, Route, Routes, useParams } from 'react-router'
import { ReaderPage } from './reader-page'
import { ErrorAlert } from '@/components/error-alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { EbookStoreError, EBOOK_STORE_ERROR_MESSAGES } from '@/lib/ebook-storage/errors'
import { ebookStore } from '@/lib/ebook-storage/connection'
import { prepareOcr } from '@/lib/pdf/ocr/recognize-page'
import { prepareCachedWebLlmModel } from '../features/chat/lib/web-llm/model'
import { EbookReaderPage } from '../pages/ebook-reader-page'
import { BookshelfPage } from '../pages/bookshelf-page'
import { OcrConsolePage } from '../pages/ocr-console-page'
import { PrivacyPolicyPage } from '../pages/privacy-policy-page'
import { TermsOfServicePage } from '../pages/terms-of-service-page'
import { OpenSourceLicensesPage } from '../pages/open-source-licenses-page'

type StorageState = { status: 'loading' | 'ready' } | { status: 'error'; message: string }

function StorageLayout() {
  const store = ebookStore
  const [state, setState] = useState<StorageState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true

    async function initialize() {
      if (!store) return
      try {
        await store.initialize()
        if (active) setState({ status: 'ready' })
      } catch (error) {
        if (active) {
          setState({
            status: 'error',
            message:
              error instanceof EbookStoreError
                ? error.message
                : EBOOK_STORE_ERROR_MESSAGES['storage-failed'],
          })
        }
      }
    }

    void initialize()
    return () => {
      active = false
    }
  }, [store, attempt])

  if (!store) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <ErrorAlert title={EBOOK_STORE_ERROR_MESSAGES.unsupported} />
      </main>
    )
  }

  if (state.status === 'loading') {
    return (
      <main className="flex min-h-svh items-center justify-center">
        <Spinner aria-label="저장소 준비 중" />
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main className="mx-auto flex min-h-svh max-w-4xl items-center px-4 py-8">
        <ErrorAlert title="저장소를 준비하지 못했습니다." description={state.message}>
          <Button
            onClick={() => {
              setState({ status: 'loading' })
              setAttempt((current) => current + 1)
            }}
          >
            다시 시도
          </Button>
        </ErrorAlert>
      </main>
    )
  }

  return <Outlet />
}

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
      <Route element={<StorageLayout />}>
        <Route path="/library" element={<BookshelfPage />} />
        <Route path="/books/:bookId" element={<EbookReaderRoute />} />
        <Route path="/console" element={<OcrConsolePage store={ebookStore} />} />
      </Route>
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
