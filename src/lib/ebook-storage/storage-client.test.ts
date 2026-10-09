import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBookInput } from '../../test/sqlocal'
import { EbookStoreClient } from './storage-client'
import { storeOperations } from './storage/operations'
import { DuplicateBookError } from './storage/errors'

vi.mock('./storage/operations', () => ({
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
