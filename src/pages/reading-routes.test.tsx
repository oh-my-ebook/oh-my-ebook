import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Link } from 'react-router'
import * as connection from '@/lib/ebook-storage/connection'
import { EbookStoreError } from '@/lib/ebook-storage/errors'
import { createStoreMock } from '@/test/ebook-store'
import { createPromiseController } from '@/test/promise-controller'
import { TestRouter } from '@/test/test-router'
import ReadingRoutes from './reading-routes'

vi.mock('@/lib/ebook-storage/connection', () => ({
  get ebookStore() {
    return null
  },
}))
vi.mock('@/lib/pdf/ocr/recognize-page', () => ({ prepareOcr: vi.fn(async () => undefined) }))
vi.mock('../features/chat/lib/web-llm/model', () => ({
  prepareCachedWebLlmModel: vi.fn(async () => undefined),
}))
vi.mock('./reader-page', () => ({
  ReaderPage: ({ title }: { title: string }) => <main aria-label="독서 화면">{title}</main>,
}))

afterEach(() => vi.restoreAllMocks())

function renderRoute(path: string) {
  return render(
    <TestRouter initialEntries={[path]}>
      <Link to="/library">서재로 이동</Link>
      <ReadingRoutes />
    </TestRouter>,
  )
}

function useStore() {
  const store = createStoreMock()
  vi.spyOn(connection, 'ebookStore', 'get').mockReturnValue(store)
  return store
}

describe('저장소를 사용하는 화면 진입', () => {
  it.each(['/library', '/books/book-id', '/console'])(
    '%s 직접 진입 시 초기화가 끝나기 전에는 저장소를 조회하지 않는다',
    async (path) => {
      const store = useStore()
      const initialization = createPromiseController<void>()
      store.initialize.mockReturnValue(initialization.promise)
      renderRoute(path)

      expect(screen.getByRole('status', { name: '저장소 준비 중' })).toBeVisible()
      expect(store.listBooks).not.toHaveBeenCalled()
      expect(store.getBook).not.toHaveBeenCalled()
      expect(store.acquireNextOcrPage).not.toHaveBeenCalled()

      await act(async () => initialization.resolve(undefined))
      if (path.startsWith('/books/')) {
        expect(await screen.findByRole('main', { name: '독서 화면' })).toBeVisible()
        expect(store.getBook).toHaveBeenCalledWith('book-id')
      } else {
        expect(store.listBooks).toHaveBeenCalled()
      }
      expect(screen.queryByRole('status', { name: '저장소 준비 중' })).not.toBeInTheDocument()
      expect(store.initialize).toHaveBeenCalledOnce()
    },
  )

  it('초기화 실패 원인을 표시하고 재시도 성공 후 리더를 연다', async () => {
    const user = userEvent.setup()
    const store = useStore()
    store.initialize.mockRejectedValueOnce(new EbookStoreError('locked'))
    renderRoute('/books/book-id')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '다른 탭에서 저장소를 사용 중입니다.',
    )
    expect(store.getBook).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByRole('main', { name: '독서 화면' })).toBeVisible()
    expect(store.initialize).toHaveBeenCalledTimes(2)
  })

  it('리더에서 서재로 이동해도 초기화를 다시 요청하지 않는다', async () => {
    const user = userEvent.setup()
    const store = useStore()
    renderRoute('/books/book-id')
    await screen.findByRole('main', { name: '독서 화면' })
    await user.click(screen.getByRole('link', { name: '서재로 이동' }))
    expect(await screen.findByRole('button', { name: '책 추가' })).toBeVisible()
    expect(store.initialize).toHaveBeenCalledOnce()
  })

  it('저장소를 지원하지 않는 브라우저에는 안내를 표시한다', () => {
    renderRoute('/books/book-id')
    expect(screen.getByRole('alert')).toHaveTextContent(
      '이 브라우저에서는 로컬 책장을 사용할 수 없습니다.',
    )
    expect(screen.queryByRole('main', { name: '독서 화면' })).not.toBeInTheDocument()
  })

  it('샘플 리더는 로컬 DB 초기화 없이 사용할 수 있다', async () => {
    const store = useStore()
    renderRoute('/sample-reader')
    expect(await screen.findByRole('main', { name: '독서 화면' })).toHaveTextContent(
      '기본 PDF 리더 샘플',
    )
    expect(store.initialize).not.toHaveBeenCalled()
  })
})
