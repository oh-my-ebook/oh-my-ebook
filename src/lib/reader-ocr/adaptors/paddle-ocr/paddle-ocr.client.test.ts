// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPromiseController } from '@/test/promise-controller'

async function createClient() {
  const predict = vi.fn()
  const dispose = vi.fn(async () => undefined)
  const create = vi.fn(async () => ({ predict, dispose }))
  vi.doMock('@paddleocr/paddleocr-js', () => ({ PaddleOCR: { create } }))
  const { PaddleOcrClient } = await import('./paddle-ocr.client')
  return { client: new PaddleOcrClient(), create, predict, dispose }
}

const image = {
  bytes: new Uint8Array([137, 80, 78, 71]),
  mimeType: 'image/png' as const,
  width: 100,
  height: 200,
}
const result = [
  {
    items: [
      {
        text: ' 원문 ',
        poly: [
          [1, 2],
          [3, 2],
          [3, 4],
          [1, 4],
        ],
      },
    ],
  },
]

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('@paddleocr/paddleocr-js')
  vi.restoreAllMocks()
})

describe('PaddleOcrClient', () => {
  it('초기화 실패 후 다음 요청에서 다시 준비한다', async () => {
    const { client, create } = await createClient()
    create.mockRejectedValueOnce(new Error('모델 오류'))

    await expect(client.initOcr()).rejects.toThrow('모델 오류')
    await expect(client.initOcr()).resolves.toBeUndefined()
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('PNG 바이트를 엔진에 전달하고 같은 엔진을 다음 요청에도 재사용한다', async () => {
    const { client, create, predict } = await createClient()
    predict.mockResolvedValue(result)
    const signal = new AbortController().signal

    await client.initOcr()
    const first = await client.recognize(image, signal)
    const second = await client.recognize(image, signal)

    expect(first).toEqual([{ text: '원문', bbox: { x0: 1, y0: 2, x1: 3, y1: 4 } }])
    expect(second).toEqual(first)
    expect(create).toHaveBeenCalledOnce()
    expect(predict).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.objectContaining({ textDetBoxThresh: 0.45 }),
    )
    const input = predict.mock.calls[0]?.[0]
    expect(input).toBeInstanceOf(Blob)
    expect(input.type).toBe('image/png')
  })

  it('마지막 요청을 취소하면 즉시 실패하고 Worker를 정리해 다음 요청에서 재생성한다', async () => {
    const { client, create, predict, dispose } = await createClient()
    const pending = createPromiseController<typeof result>()
    predict.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(result)
    const controller = new AbortController()
    const recognition = client.recognize(image, controller.signal)
    await vi.waitFor(() => expect(predict).toHaveBeenCalledOnce())

    controller.abort()
    await expect(recognition).rejects.toBe(controller.signal.reason)
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce())
    await expect(client.recognize(image, new AbortController().signal)).resolves.toHaveLength(1)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('다른 요청이 같은 엔진을 사용 중이면 한 요청의 취소로 종료하지 않는다', async () => {
    const { client, predict, dispose } = await createClient()
    const firstPending = createPromiseController<typeof result>()
    const secondPending = createPromiseController<typeof result>()
    predict.mockReturnValueOnce(firstPending.promise).mockReturnValueOnce(secondPending.promise)
    const firstController = new AbortController()
    const first = client.recognize(image, firstController.signal)
    const second = client.recognize(image, new AbortController().signal)
    await vi.waitFor(() => expect(predict).toHaveBeenCalledTimes(2))

    firstController.abort()
    await expect(first).rejects.toBe(firstController.signal.reason)
    expect(dispose).not.toHaveBeenCalled()
    secondPending.resolve(result)
    await expect(second).resolves.toHaveLength(1)
    expect(dispose).not.toHaveBeenCalled()
  })

  it('초기화 중 취소하면 준비가 끝난 엔진도 정리한다', async () => {
    const { client, create, predict, dispose } = await createClient()
    const initialization = createPromiseController<Awaited<ReturnType<typeof create>>>()
    create.mockReturnValueOnce(initialization.promise)
    const controller = new AbortController()
    const recognition = client.recognize(image, controller.signal)
    controller.abort()

    await expect(recognition).rejects.toBe(controller.signal.reason)
    initialization.resolve({ predict, dispose })
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce())
    expect(predict).not.toHaveBeenCalled()
  })
})
