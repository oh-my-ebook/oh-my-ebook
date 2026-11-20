import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import type { ChatModel } from '@shared/lib/chat/chat-model'
import { stubSupportedGpu, stubWorker } from '@/test/web-llm-stubs'
import { WebLlmProvider } from './web-llm.provider'
import type { WebLlmEngine } from './web-llm.type'
import { createWebLlmChatModel } from './web-llm.client'

function createEngine(chunks: string[]) {
  const create = vi.fn<WebLlmEngine['chat']['completions']['create']>(async () => ({
    async *[Symbol.asyncIterator]() {
      for (const content of chunks) {
        yield { choices: [{ delta: { content } }] }
      }
    },
  }))
  const engine = {
    chat: { completions: { create } },
    interruptGenerate: vi.fn(),
  }
  return { create, engine }
}

function setupWebLlm(createWebWorkerMLCEngine = vi.fn<() => Promise<WebLlmEngine>>()) {
  onTestFinished(stubSupportedGpu())
  stubWorker()
  vi.doMock('@mlc-ai/web-llm', () => ({ CreateWebWorkerMLCEngine: createWebWorkerMLCEngine }))

  const provider = new WebLlmProvider()
  const webLlmChatModel = createWebLlmChatModel(provider)
  return { provider, webLlmChatModel, createWebWorkerMLCEngine }
}

function requestResponse(model: ChatModel, signal = new AbortController().signal) {
  const response = model.streamResponse({
    messages: [{ role: 'user', content: '질문' }],
    maxOutputTokens: 512,
    signal,
  })
  return response[Symbol.asyncIterator]()
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.doUnmock('@mlc-ai/web-llm')
})

it('텍스트 조각을 전달하고 생성 중 취소하면 WebLLM에 중단을 요청한다', async () => {
  const { create, engine } = createEngine(['답변'])
  const { webLlmChatModel, provider } = setupWebLlm(vi.fn(async () => engine))
  await provider.prepareModel()
  const controller = new AbortController()

  const response = requestResponse(webLlmChatModel, controller.signal)
  await expect(response.next()).resolves.toEqual({ value: '답변', done: false })
  controller.abort()
  await response.return?.()

  expect(create).toHaveBeenCalledWith({
    messages: [{ role: 'user', content: '질문' }],
    max_tokens: 512,
    stream: true,
    temperature: 0.3,
  })
  expect(engine.interruptGenerate).toHaveBeenCalledOnce()
})

it('모델 준비 전에 생성 요청이 와도 다운로드를 시작하지 않는다', async () => {
  const { webLlmChatModel, provider, createWebWorkerMLCEngine } = setupWebLlm()

  await expect(requestResponse(webLlmChatModel).next()).rejects.toThrow(
    '모델이 준비되지 않았습니다.',
  )

  expect(createWebWorkerMLCEngine).not.toHaveBeenCalled()
  expect(provider.modelStore.getState().status).toBe('idle')
})

it('다운로드에 실패한 뒤 생성 요청이 와도 재다운로드는 사용자가 시작한다', async () => {
  const { engine } = createEngine(['답변'])
  const createWebWorkerMLCEngine = vi
    .fn<() => Promise<WebLlmEngine>>()
    .mockRejectedValueOnce(new Error('failed to fetch model shard'))
    .mockResolvedValueOnce(engine)
  const { webLlmChatModel, provider } = setupWebLlm(createWebWorkerMLCEngine)
  await expect(provider.prepareModel()).rejects.toThrow('failed to fetch model shard')

  await expect(requestResponse(webLlmChatModel).next()).rejects.toThrow(
    '모델이 준비되지 않았습니다.',
  )
  expect(createWebWorkerMLCEngine).toHaveBeenCalledOnce()
  expect(provider.modelStore.getState().status).toBe('error')

  await provider.prepareModel()
  const response = requestResponse(webLlmChatModel)
  await expect(response.next()).resolves.toEqual({ value: '답변', done: false })
  await response.return?.()
})

it('생성 중 엔진이 실패하면 재시도할 때 새 엔진으로 답변한다', async () => {
  const { create, engine: failingEngine } = createEngine([])
  create.mockRejectedValueOnce(new Error('device lost during generation'))
  const { engine: workingEngine } = createEngine(['답변'])
  const createWebWorkerMLCEngine = vi
    .fn<() => Promise<WebLlmEngine>>()
    .mockResolvedValueOnce(failingEngine)
    .mockResolvedValueOnce(workingEngine)
  const { webLlmChatModel, provider } = setupWebLlm(createWebWorkerMLCEngine)
  await provider.prepareModel()

  await expect(requestResponse(webLlmChatModel).next()).rejects.toThrow(
    'device lost during generation',
  )
  expect(provider.modelStore.getState().status).toBe('error')

  await provider.prepareModel()
  const response = requestResponse(webLlmChatModel)
  await expect(response.next()).resolves.toEqual({ value: '답변', done: false })
  await response.return?.()
  expect(provider.modelStore.getState().status).toBe('ready')
})
