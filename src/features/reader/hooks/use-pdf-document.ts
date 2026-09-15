import { useEffect, useState } from 'react'
import {
  loadPdfDocument,
  toPdfDocumentError,
  type LoadedPdfDocument,
  type PdfDocumentError,
  type PdfDocumentLoader,
  type PdfPageInfo,
} from '../lib/pdf-document'

interface LoadingState {
  status: 'loading'
  document: null
  pages: readonly PdfPageInfo[]
  error: null
}

interface ReadyState {
  status: 'ready'
  document: LoadedPdfDocument['document']
  pages: readonly PdfPageInfo[]
  error: null
}

interface ErrorState {
  status: 'error'
  document: null
  pages: readonly PdfPageInfo[]
  error: PdfDocumentError
}

export type PdfDocumentState = LoadingState | ReadyState | ErrorState

interface RetryControl {
  retry: () => void
}

export type UsePdfDocumentResult = PdfDocumentState & RetryControl

function createLoadingState(): LoadingState {
  return {
    status: 'loading',
    document: null,
    pages: [],
    error: null,
  }
}

export function usePdfDocument(
  url: string,
  loadDocument: PdfDocumentLoader = loadPdfDocument,
): UsePdfDocumentResult {
  const [state, setState] = useState<PdfDocumentState>(createLoadingState)
  const [attempt, setAttempt] = useState(0)

  const retry = () => {
    setAttempt((currentAttempt) => currentAttempt + 1)
  }

  useEffect(() => {
    const controller = new AbortController()

    // URL 변경이나 재시도로 새 요청을 시작할 때 이전 결과를 비운다.
    // oxlint-disable-next-line react/set-state-in-effect
    setState(createLoadingState())

    const settleLoadingTask = async () => {
      try {
        const loaded = await loadDocument(url, controller.signal)
        // 이전 요청이 뒤늦게 끝나도 현재 상태를 덮어쓰지 않는다.
        if (controller.signal.aborted) {
          return
        }
        setState({
          status: 'ready',
          document: loaded.document,
          pages: loaded.pages,
          error: null,
        })
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }
        setState({
          status: 'error',
          document: null,
          pages: [],
          error: toPdfDocumentError(error),
        })
      }
    }

    settleLoadingTask()

    return () => {
      controller.abort()
    }
  }, [attempt, loadDocument, url])

  return { ...state, retry }
}
