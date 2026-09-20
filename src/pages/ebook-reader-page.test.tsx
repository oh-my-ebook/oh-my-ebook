import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BookMetadata } from '../features/reader/lib/book-metadata'
import { createPromiseController } from '../test/promise-controller'
import { EbookReaderPage } from './ebook-reader-page'

const readerProps = vi.hoisted(() => vi.fn())

vi.mock('../features/reader/components/reader', () => ({
  Reader: (props: {
    bookMetadata?: BookMetadata
    initialPage?: number
    onPageChange?(pageNumber: number): void
    title?: string
  }) => {
    readerProps(props)
    return (
      <main aria-label="독서 화면">
        <h1>{props.title}</h1>
        <p>초기 페이지 {props.initialPage}</p>
        <button onClick={() => props.onPageChange?.(2)}>2페이지</button>
        <button onClick={() => props.onPageChange?.(3)}>3페이지</button>
      </main>
    )
  },
}))

function createBook(overrides: Record<string, unknown> = {}) {
  return {
    id: 'book-id',
    file_name: 'book.pdf',
    title: '저장한 책',
    author: '저자',
    pdf_subject: '주제',
    pdf_keywords: null,
    publisher: '출판사',
    pdf_data: new Uint8Array([1, 2, 3]),
    last_page: 12,
    analysis_status: 'ready',
    ...overrides,
  }
}

function createStore(book: unknown = createBook()) {
  return {
    request: vi.fn(async (command: string) => {
      if (command === 'getBook') return book
      return null
    }),
  }
}

describe('EbookReaderPage', () => {
  it('책을 불러오는 동안 스피너로 로딩 상태를 알린다', () => {
    const pendingBook = createPromiseController<unknown>()
    const store = { request: vi.fn(() => pendingBook.promise) }
    render(<EbookReaderPage bookId="book-id" store={store} />)

    expect(screen.getByRole('status', { name: '책을 불러오는 중' })).toBeInTheDocument()
    expect(screen.queryByText('책을 불러오는 중')).not.toBeInTheDocument()
  })

  it('책 원본과 저장된 마지막 페이지를 Reader에 전달한다', async () => {
    const store = createStore()
    render(<EbookReaderPage bookId="book-id" store={store} />)

    expect(await screen.findByRole('main', { name: '독서 화면' })).toBeInTheDocument()
    expect(screen.getByText('초기 페이지 12')).toBeInTheDocument()
    expect(readerProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: new Uint8Array([1, 2, 3]),
        bookId: 'book-id',
        bookMetadata: {
          author: '저자',
          publisher: '출판사',
          subject: '주제',
          title: '저장한 책',
        },
        initialPage: 12,
        analysisStatus: 'ready',
        searchChunks: expect.any(Function),
        title: '저장한 책',
      }),
    )
    expect(store.request).toHaveBeenCalledWith('getBook', 'book-id')
  })

  it.each([
    ['없는 책', null, '책을 찾을 수 없습니다.'],
    ['원본 읽기 실패', { ...createBook(), pdf_data: null }, '저장된 PDF 원본을 읽지 못했습니다.'],
  ])('%s을 안내한다', async (_label, book, message) => {
    render(<EbookReaderPage bookId="book-id" store={createStore(book)} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('원본 로드 실패 후 다시 시도하거나 책장으로 이동할 수 있다', async () => {
    const user = userEvent.setup()
    let shouldFail = true
    const store = createStore()
    store.request.mockImplementation(async (command: string) => {
      if (command === 'getBook' && shouldFail) throw new Error('read failed')
      if (command === 'getBook') return createBook()
      return null
    })
    render(<EbookReaderPage bookId="book-id" store={store} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('저장된 PDF 원본을 읽지 못했습니다.')
    expect(screen.getByRole('link', { name: '책장으로 이동' })).toHaveAttribute('href', '/library')
    shouldFail = false
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByRole('main', { name: '독서 화면' })).toBeInTheDocument()
  })

  it('빠르게 이동해도 마지막 페이지를 순서대로 저장한다', async () => {
    const user = userEvent.setup()
    const firstWrite = createPromiseController<unknown>()
    const store = createStore()
    store.request.mockImplementation((command: string) => {
      if (command === 'getBook') return Promise.resolve(createBook())
      if (command === 'updateProgress') return firstWrite.promise
      return Promise.resolve(null)
    })
    render(<EbookReaderPage bookId="book-id" store={store} />)
    await screen.findByRole('main', { name: '독서 화면' })

    await user.click(screen.getByRole('button', { name: '2페이지' }))
    await user.click(screen.getByRole('button', { name: '3페이지' }))
    expect(store.request).toHaveBeenLastCalledWith('updateProgress', { id: 'book-id', page: 2 })

    firstWrite.resolve(null)
    await waitFor(() => {
      expect(store.request).toHaveBeenLastCalledWith('updateProgress', { id: 'book-id', page: 3 })
    })
  })

  it('페이지를 숨길 때 대기 중인 진행률 저장을 이어서 처리한다', async () => {
    const user = userEvent.setup()
    const firstWrite = createPromiseController<unknown>()
    const store = createStore()
    store.request.mockImplementation((command: string) => {
      if (command === 'getBook') return Promise.resolve(createBook())
      if (command === 'updateProgress') return firstWrite.promise
      return Promise.resolve(null)
    })
    render(<EbookReaderPage bookId="book-id" store={store} />)
    await screen.findByRole('main', { name: '독서 화면' })
    await user.click(screen.getByRole('button', { name: '2페이지' }))
    await user.click(screen.getByRole('button', { name: '3페이지' }))

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    firstWrite.resolve(null)

    await waitFor(() => {
      expect(store.request).toHaveBeenLastCalledWith('updateProgress', { id: 'book-id', page: 3 })
    })
  })

  it('진행률 저장이 실패해도 독서를 유지한다', async () => {
    const user = userEvent.setup()
    const store = createStore()
    store.request.mockImplementation((command: string) => {
      if (command === 'getBook') return Promise.resolve(createBook())
      if (command === 'updateProgress') return Promise.reject(new Error('write failed'))
      return Promise.resolve(null)
    })
    render(<EbookReaderPage bookId="book-id" store={store} />)
    await screen.findByRole('main', { name: '독서 화면' })

    await user.click(screen.getByRole('button', { name: '2페이지' }))

    await waitFor(() =>
      expect(store.request).toHaveBeenCalledWith('updateProgress', { id: 'book-id', page: 2 }),
    )
    expect(screen.getByRole('main', { name: '독서 화면' })).toBeInTheDocument()
  })
})
