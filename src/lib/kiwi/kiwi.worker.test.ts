import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPromiseController } from '@/test/promise-controller'
import { KIWI_REQUEST } from './const'
import type { KiwiWorkerRequest, KiwiWorkerResponse } from './kiwi.types'

interface WorkerScope {
  onmessage: ((event: MessageEvent<KiwiWorkerRequest>) => Promise<void>) | null
  postMessage(response: KiwiWorkerResponse): void
}

function createWorkerStub() {
  const kiwi = {
    tokenize: vi.fn((text: string) =>
      text
        .split(' ')
        .filter(Boolean)
        .map((str) => ({ str, tag: 'NNG' })),
    ),
    joinSent: vi.fn((morphs: Array<{ form: string; tag: string }>) => ({
      str: morphs.map(({ form }) => form).join('·'),
    })),
  }
  const initialization = createPromiseController<typeof kiwi>()
  const build = vi.fn(async () => await initialization.promise)
  const create = vi.fn(async () => ({ build }))
  const postMessage = vi.fn<(response: KiwiWorkerResponse) => void>()
  const scope: WorkerScope = {
    onmessage: null,
    postMessage,
  }

  vi.doMock('kiwi-nlp', () => ({
    KiwiBuilder: { create },
    Match: { allWithNormalizing: 1 },
  }))
  vi.stubGlobal('self', scope)

  async function send(request: KiwiWorkerRequest) {
    if (!scope.onmessage) throw new Error('Worker 메시지 핸들러가 등록되지 않았습니다.')
    await scope.onmessage(new MessageEvent('message', { data: request }))
  }

  return { kiwi, initialization, build, create, postMessage, send }
}

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('kiwi-nlp')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Kiwi Worker', () => {
  it('여러 요청을 하나의 Provider로 처리하고 요청별 응답을 보낸다', async () => {
    const { kiwi, initialization, create, postMessage, send } = createWorkerStub()
    await import('./kiwi.worker')
    expect(create).not.toHaveBeenCalled()

    const normalization = send({ id: 1, type: KIWI_REQUEST.NORMALIZE_TEXT, text: 'OCR 문장' })
    const extraction = send({ id: 2, type: KIWI_REQUEST.EXTRACT_SEARCH_TERMS, text: '검색 검색' })
    initialization.resolve(kiwi)
    await Promise.all([normalization, extraction])
    await send({ id: 3, type: KIWI_REQUEST.NORMALIZE_TEXT, text: '다음 문장' })

    expect(postMessage.mock.calls.map(([response]) => response)).toEqual(
      expect.arrayContaining([
        { id: 1, ok: true, type: KIWI_REQUEST.NORMALIZE_TEXT, text: 'OCR·문장' },
        {
          id: 2,
          ok: true,
          type: KIWI_REQUEST.EXTRACT_SEARCH_TERMS,
          terms: [{ term: '검색', frequency: 2 }],
        },
        { id: 3, ok: true, type: KIWI_REQUEST.NORMALIZE_TEXT, text: '다음·문장' },
      ]),
    )
    expect(postMessage).toHaveBeenCalledTimes(3)
    expect(create).toHaveBeenCalledOnce()
  })

  it('Provider 초기화 실패를 해당 요청의 실패 응답으로 보낸다', async () => {
    const { create, postMessage, send } = createWorkerStub()
    create.mockRejectedValueOnce(new Error('모델 초기화 실패'))
    await import('./kiwi.worker')

    await send({ id: 1, type: KIWI_REQUEST.NORMALIZE_TEXT, text: '문장' })

    expect(postMessage).toHaveBeenCalledWith({
      id: 1,
      ok: false,
      type: KIWI_REQUEST.NORMALIZE_TEXT,
      error: '모델 초기화 실패',
    })
  })

  it('분석 실패 후에도 초기화된 Kiwi로 다음 요청을 처리한다', async () => {
    const { kiwi, initialization, create, postMessage, send } = createWorkerStub()
    kiwi.tokenize.mockImplementationOnce(() => {
      throw new Error('분석 실패')
    })
    initialization.resolve(kiwi)
    await import('./kiwi.worker')

    await send({ id: 1, type: KIWI_REQUEST.NORMALIZE_TEXT, text: '문장' })

    expect(postMessage).toHaveBeenLastCalledWith({
      id: 1,
      ok: false,
      type: KIWI_REQUEST.NORMALIZE_TEXT,
      error: '분석 실패',
    })

    await send({ id: 2, type: KIWI_REQUEST.NORMALIZE_TEXT, text: '새 문장' })

    expect(postMessage).toHaveBeenLastCalledWith({
      id: 2,
      ok: true,
      type: KIWI_REQUEST.NORMALIZE_TEXT,
      text: '새·문장',
    })
    expect(create).toHaveBeenCalledOnce()
  })
})
