import { describe, expect, it, vi } from 'vitest'
import { EbookStoreClient, EbookStoreError } from './ebook-store-client'

function createWorker() {
  const sent: { message: unknown; transfer: Transferable[] }[] = []
  let onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  let onerror: ((event: ErrorEvent) => void) | null = null
  const worker = {
    get onmessage() {
      return onmessage
    },
    set onmessage(listener: ((event: MessageEvent<unknown>) => void) | null) {
      onmessage = listener
    },
    get onerror() {
      return onerror
    },
    set onerror(listener: ((event: ErrorEvent) => void) | null) {
      onerror = listener
    },
    postMessage(message: unknown, transfer: Transferable[] = []) {
      sent.push({ message, transfer })
    },
    terminate: vi.fn(),
  }
  const respond = (data: unknown) => onmessage?.(new MessageEvent('message', { data }))
  const fail = () => onerror?.(new ErrorEvent('error', { message: 'worker crashed' }))

  return { worker, sent, respond, fail }
}

describe('EbookStoreClient', () => {
  it('동시에 보낸 요청을 ID로 구분해 응답 순서와 무관하게 완료한다', async () => {
    const { worker, sent, respond } = createWorker()
    const client = new EbookStoreClient(worker)
    const first = client.request('initialize')
    const second = client.request('listBooks')

    expect(sent.map(({ message }) => message)).toEqual([
      { requestId: 1, command: 'initialize' },
      { requestId: 2, command: 'listBooks' },
    ])

    respond({ requestId: 999, result: 'unrelated' })
    respond({ requestId: 2, result: ['book'] })
    respond({ requestId: 1, result: undefined })

    await expect(first).resolves.toBeUndefined()
    await expect(second).resolves.toEqual(['book'])
  })

  it('책 추가 시 PDF 원본 ArrayBuffer를 transferable로 전달한다', async () => {
    const { worker, sent, respond } = createWorker()
    const client = new EbookStoreClient(worker)
    const pdfData = new Uint8Array([1, 2, 3]).buffer
    const input = {
      pdfData,
      contentHash: 'hash',
      fileName: 'a.pdf',
      title: 'A',
      author: null,
      pdfTitle: null,
      pdfSubject: null,
      pdfKeywords: null,
      publisher: null,
      pdfSize: pdfData.byteLength,
      pageCount: 1,
      coverData: null,
      coverMime: null,
      coverStatus: 'fallback' as const,
    }
    const added = client.saveBook(input)

    expect(sent[0]).toEqual({
      message: { requestId: 1, command: 'saveBook', payload: input },
      transfer: [pdfData],
    })

    respond({ requestId: 1, result: 'book-id' })
    await expect(added).resolves.toBe('book-id')
  })

  it('Worker 오류 코드를 도메인 오류로 바꾸고 알 수 없는 코드는 저장 실패로 처리한다', async () => {
    const { worker, respond } = createWorker()
    const client = new EbookStoreClient(worker)
    const duplicate = client.request('listBooks')
    respond({ requestId: 1, error: { code: 'duplicate' } })
    await expect(duplicate).rejects.toMatchObject({ code: 'duplicate' })

    const unknown = client.request('listBooks')
    respond({ requestId: 2, error: { code: 'unexpected' } })
    await expect(unknown).rejects.toMatchObject({ code: 'storage-failed' })
  })

  it('Worker 오류가 발생하면 대기 중인 모든 요청을 실패시키고 새 요청을 막는다', async () => {
    const { worker, fail } = createWorker()
    const client = new EbookStoreClient(worker)
    const first = client.request('initialize')
    const second = client.request('listBooks')

    fail()

    await expect(first).rejects.toMatchObject({ code: 'storage-failed' })
    await expect(second).rejects.toMatchObject({ code: 'storage-failed' })
    await expect(client.request('listBooks')).rejects.toBeInstanceOf(EbookStoreError)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('종료 시 대기 요청을 정리하고 늦은 응답을 무시한다', async () => {
    const { worker, respond } = createWorker()
    const client = new EbookStoreClient(worker)
    const pending = client.request('listBooks')

    client.close()
    respond({ requestId: 1, result: ['late'] })

    await expect(pending).rejects.toMatchObject({ code: 'storage-failed' })
    await expect(client.request('listBooks')).rejects.toMatchObject({ code: 'storage-failed' })
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('잠금 오류는 새 요청 ID로 최대 세 번 시도한 뒤 실패한다', async () => {
    const { worker, sent, respond } = createWorker()
    const client = new EbookStoreClient(worker)
    const pending = client.request('listBooks')

    respond({ requestId: 1, error: { code: 'locked' } })
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    respond({ requestId: 2, error: { code: 'locked' } })
    await vi.waitFor(() => expect(sent).toHaveLength(3))
    respond({ requestId: 3, error: { code: 'locked' } })

    await expect(pending).rejects.toMatchObject({ code: 'locked' })
    expect(sent.map(({ message }) => message)).toEqual([
      { requestId: 1, command: 'listBooks' },
      { requestId: 2, command: 'listBooks' },
      { requestId: 3, command: 'listBooks' },
    ])
  })

  it('전송된 PDF 원본은 잠금 오류가 나도 다시 보내지 않는다', async () => {
    const { worker, sent, respond } = createWorker()
    const client = new EbookStoreClient(worker)
    const pending = client.saveBook({
      pdfData: new ArrayBuffer(8),
      contentHash: 'hash',
      fileName: 'a.pdf',
      title: 'A',
      author: null,
      pdfTitle: null,
      pdfSubject: null,
      pdfKeywords: null,
      publisher: null,
      pdfSize: 8,
      pageCount: 1,
      coverData: null,
      coverMime: null,
      coverStatus: 'fallback',
    })

    respond({ requestId: 1, error: { code: 'locked' } })

    await expect(pending).rejects.toMatchObject({ code: 'locked' })
    expect(sent).toHaveLength(1)
  })
})
