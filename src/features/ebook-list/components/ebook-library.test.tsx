import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as storage from '../lib/storage-manager'
import * as pdfImport from '../lib/pdf-import'
import { createPromiseController } from '@/test/promise-controller'
import { EbookLibrary } from './ebook-library'

function createStore() {
  return {
    request: vi.fn(async (command: string): Promise<unknown> =>
      command === 'listBooks' ? [] : null,
    ),
    addBook: vi.fn(async () => 'saved-id'),
  }
}

function createStoredBook(title: string) {
  return {
    id: `${title}-id`,
    content_hash: `${title}-hash`,
    file_name: `${title}.pdf`,
    title,
    page_count: 1,
    cover_data: null,
    cover_mime: null,
    cover_status: 'fallback' as const,
    last_page: null,
    created_at: 0,
    updated_at: 0,
  }
}

describe('EbookLibrary', () => {
  afterEach(() => vi.restoreAllMocks())
  it('초기화 중 책장 조작을 비활성화하고 완료 후 빈 상태를 알린다', async () => {
    const initialization = createPromiseController<unknown>()
    const store = createStore()
    store.request.mockImplementationOnce(() => initialization.promise)
    render(<EbookLibrary store={store} />)

    expect(screen.getByRole('status', { name: '책장 불러오는 중' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'PDF 추가' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '새로고침' })).toBeDisabled()

    initialization.resolve(null)
    expect(await screen.findByText('아직 저장한 책이 없습니다.')).toBeInTheDocument()
    expect(screen.getByText(/이 브라우저에만 저장/)).toBeInTheDocument()
    expect(screen.getByText(/브라우저 데이터를 삭제하면/)).toBeInTheDocument()
    expect(store.request).toHaveBeenCalledWith('listBooks')
  })

  it('DB 초기화가 실패하면 오류를 보여 주고 재시도한다', async () => {
    const user = userEvent.setup()
    const store = createStore()
    store.request.mockRejectedValueOnce(new Error('failed'))
    render(<EbookLibrary store={store} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('로컬 저장소에 접근하지 못했습니다.')
    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText('아직 저장한 책이 없습니다.')).toBeInTheDocument()
    expect(store.request).toHaveBeenCalledTimes(3)
  })

  it('영구 저장 상태와 무관하게 업로드한다', async () => {
    const user = userEvent.setup()
    const store = createStore()
    vi.spyOn(storage, 'requestPersistentStorage').mockResolvedValue(false)
    vi.spyOn(storage, 'getPersistentStorageStatus').mockResolvedValue(false)
    vi.spyOn(storage, 'getStorageCapacity').mockResolvedValue(null)
    vi.spyOn(pdfImport, 'analyzePdf').mockResolvedValue({
      pdfData: new ArrayBuffer(1),
      contentHash: 'hash',
      fileName: 'first.pdf',
      title: '첫 번째 책',
      pageCount: 1,
      coverData: null,
      coverMime: null,
      coverStatus: 'fallback',
    })
    render(<EbookLibrary store={store} />)

    await screen.findByText('아직 저장한 책이 없습니다.')
    await user.upload(
      screen.getByLabelText('PDF 파일 선택'),
      new File(['pdf'], 'first.pdf', { type: 'application/pdf' }),
    )

    expect(store.addBook).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'PDF 추가' })).toBeEnabled()
    expect(storage.requestPersistentStorage).not.toHaveBeenCalled()
  })

  it('파일마다 최신 잔여량을 확인하고 일부 실패 후 다음 파일을 처리한다', async () => {
    const user = userEvent.setup()
    const store = createStore()
    const capacity = vi.spyOn(storage, 'getStorageCapacity')
    capacity.mockResolvedValueOnce({ usage: 0, quota: 100, remaining: 100 })
    capacity.mockResolvedValueOnce({ usage: 0, quota: 100, remaining: 100 })
    capacity.mockResolvedValueOnce({ usage: 0, quota: 100, remaining: 100 })
    capacity.mockResolvedValueOnce({ usage: 90, quota: 100, remaining: 10 })
    capacity.mockResolvedValue({ usage: 90, quota: 100, remaining: 10 })
    vi.spyOn(pdfImport, 'analyzePdf').mockResolvedValue({
      pdfData: new ArrayBuffer(1),
      contentHash: 'hash',
      fileName: 'a.pdf',
      title: 'A',
      pageCount: 1,
      coverData: null,
      coverMime: null,
      coverStatus: 'fallback',
    })
    store.addBook.mockRejectedValueOnce(new Error('write failed'))
    render(<EbookLibrary store={store} />)
    await screen.findByText('아직 저장한 책이 없습니다.')

    await user.upload(screen.getByLabelText('PDF 파일 선택'), [
      new File(['one'], 'one.pdf', { type: 'application/pdf' }),
      new File(['two'.repeat(10)], 'two.pdf', { type: 'application/pdf' }),
    ])

    expect(await screen.findByText(/저장에 실패/)).toBeVisible()
    expect(await screen.findByText(/저장 공간이 부족/)).toBeVisible()
    expect(store.addBook).toHaveBeenCalledTimes(1)
    expect(capacity).toHaveBeenCalled()
  })

  it('수동 새로고침이 목록과 용량을 함께 교체한다', async () => {
    const user = userEvent.setup()
    const store = createStore()
    store.request.mockImplementation(async (command: string) => {
      if (command !== 'listBooks') return null
      return store.request.mock.calls.filter(
        ([requestedCommand]) => requestedCommand === 'listBooks',
      ).length === 1
        ? [createStoredBook('기존 책')]
        : [createStoredBook('새 책')]
    })
    const capacity = vi.spyOn(storage, 'getStorageCapacity')
    capacity
      .mockResolvedValueOnce({ usage: 1, quota: 10, remaining: 9 })
      .mockResolvedValueOnce({ usage: 2, quota: 20, remaining: 18 })
    render(<EbookLibrary store={store} />)

    expect(await screen.findByText('기존 책')).toBeInTheDocument()
    expect(screen.getByText('읽지 않음 · 전체 1페이지')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '새로고침' }))

    expect(await screen.findByText('새 책')).toBeInTheDocument()
    expect(screen.queryByText('기존 책')).not.toBeInTheDocument()
    expect(screen.getByText('예상 잔여량 18 B')).toBeInTheDocument()
  })

  it('수동 새로고침 실패 시 기존 목록을 유지하고 재시도한다', async () => {
    const user = userEvent.setup()
    const store = createStore()
    store.request.mockImplementation(async (command: string) => {
      if (command !== 'listBooks') return null
      const listRequestCount = store.request.mock.calls.filter(
        ([requestedCommand]) => requestedCommand === 'listBooks',
      ).length
      if (listRequestCount === 1) return [createStoredBook('기존 책')]
      if (listRequestCount === 2) throw new Error('failed')
      return [createStoredBook('새 책')]
    })
    render(<EbookLibrary store={store} />)

    expect(await screen.findByText('기존 책')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '새로고침' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('책장을 새로고침하지 못했습니다.')
    expect(screen.getByText('기존 책')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText('새 책')).toBeInTheDocument()
  })
})
