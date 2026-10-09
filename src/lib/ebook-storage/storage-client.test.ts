import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBookInput } from '../../test/sqlocal'
import { EbookStoreClient } from './storage-client'
import { executeCommand, storeOperations } from './storage/operations'
import { DuplicateBookError } from './storage/errors'

vi.mock('./storage/operations', () => ({
  executeCommand: vi.fn(),
  storeOperations: {
    saveBook: vi.fn(),
    clearStorage: vi.fn(),
    listBooks: vi.fn(),
    initialize: vi.fn(),
  },
}))
afterEach(() => {
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

describe('EbookStoreClient', () => {
  it('저장이 끝난 뒤 전체 삭제를 실행하고 각 호출자에게 결과를 돌려준다', async () => {
    let finishSave: ((id: string) => void) | undefined
    const saving = new Promise<string>((resolve) => {
      finishSave = resolve
    })
    vi.mocked(storeOperations.saveBook).mockImplementationOnce(async () => await saving)
    const client = new EbookStoreClient()
    const save = client.saveBook(createBookInput())
    const clear = client.clearStorage()
    await vi.waitFor(() => expect(storeOperations.saveBook).toHaveBeenCalledOnce())
    expect(storeOperations.clearStorage).not.toHaveBeenCalled()
    finishSave?.('book-id')
    await expect(save).resolves.toBe('book-id')
    await expect(clear).resolves.toBeUndefined()
    expect(storeOperations.clearStorage).toHaveBeenCalledOnce()
  })

  it('이전 요청 실패를 호출자에게 전달하고 다음 요청은 계속 처리한다', async () => {
    vi.mocked(storeOperations.saveBook).mockRejectedValueOnce(new DuplicateBookError())
    vi.mocked(storeOperations.listBooks).mockResolvedValueOnce([])
    const client = new EbookStoreClient()
    const failed = client.saveBook(createBookInput())
    const list = client.listBooks()
    await expect(failed).rejects.toMatchObject({ code: 'duplicate' })
    await expect(list).resolves.toEqual([])
  })

  it('잠금 오류는 최대 세 번까지 재시도한다', async () => {
    vi.mocked(storeOperations.listBooks).mockRejectedValue({ resultCode: 5 })
    const client = new EbookStoreClient()
    await expect(client.listBooks()).rejects.toMatchObject({ code: 'locked' })
    expect(storeOperations.listBooks).toHaveBeenCalledTimes(3)
  })

  it('책 저장은 자동 재시도하지 않는다', async () => {
    vi.mocked(storeOperations.saveBook).mockRejectedValue({ resultCode: 5 })
    await expect(new EbookStoreClient().saveBook(createBookInput())).rejects.toMatchObject({
      code: 'locked',
    })
    expect(storeOperations.saveBook).toHaveBeenCalledOnce()
  })

  it('알 수 없는 오류의 원인을 보존해 저장 실패로 전달한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = new Error('failure')
    vi.mocked(storeOperations.initialize).mockRejectedValue(error)
    await expect(new EbookStoreClient().initialize()).rejects.toMatchObject({
      code: 'storage-failed',
      cause: error,
    })
  })
})

describe('기존 명령 API와의 호환', () => {
  it('새 저장 메서드가 끝난 뒤 기존 삭제 요청을 실행한다', async () => {
    let finishSave: ((id: string) => void) | undefined
    const saving = new Promise<string>((resolve) => {
      finishSave = resolve
    })
    vi.mocked(storeOperations.saveBook).mockImplementationOnce(async () => await saving)
    const client = new EbookStoreClient()
    const save = client.saveBook(createBookInput())
    const clear = client.request('clearStorage')
    await vi.waitFor(() => expect(storeOperations.saveBook).toHaveBeenCalledOnce())
    expect(executeCommand).not.toHaveBeenCalled()
    finishSave?.('book-id')
    await expect(save).resolves.toBe('book-id')
    await expect(clear).resolves.toBeNull()
    expect(executeCommand).toHaveBeenCalledWith({ command: 'clearStorage', payload: undefined })
  })

  it('기존 초기화 요청이 끝난 뒤 새 조회 메서드를 실행한다', async () => {
    let finish: (() => void) | undefined
    const initializing = new Promise<void>((resolve) => {
      finish = resolve
    })
    vi.mocked(executeCommand).mockImplementationOnce(async () => await initializing)
    vi.mocked(storeOperations.listBooks).mockResolvedValueOnce([])
    const client = new EbookStoreClient()
    const initialize = client.request('initialize')
    const list = client.listBooks()
    await vi.waitFor(() => expect(executeCommand).toHaveBeenCalledOnce())
    expect(storeOperations.listBooks).not.toHaveBeenCalled()
    finish?.()
    await expect(initialize).resolves.toBeNull()
    await expect(list).resolves.toEqual([])
  })

  it('기존 요청도 잠금 오류를 최대 세 번 시도한 뒤 다음 메서드를 처리한다', async () => {
    vi.mocked(executeCommand).mockRejectedValue({ resultCode: 5 })
    vi.mocked(storeOperations.listBooks).mockResolvedValueOnce([])
    const client = new EbookStoreClient()
    const legacy = client.request('hasBook', 'book-id')
    const list = client.listBooks()
    await expect(legacy).rejects.toMatchObject({ code: 'locked' })
    expect(executeCommand).toHaveBeenCalledTimes(3)
    expect(executeCommand).toHaveBeenCalledWith({ command: 'hasBook', payload: 'book-id' })
    await expect(list).resolves.toEqual([])
  })
})
