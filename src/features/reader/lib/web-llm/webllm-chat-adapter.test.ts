import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatModelRunOptions, ChatModelRunResult, ThreadMessage } from '@assistant-ui/react'
import { stubSupportedGpu, stubWorker } from '../../../../test/web-llm-stubs'
import { createWebLlmChatModelAdapter } from './webllm-chat-adapter'
import type { WebLlmEngine } from './webllm-model'

function createMessage(role: 'user' | 'assistant', text: string): ThreadMessage {
  const common = {
    id: `${role}-${text}`,
    createdAt: new Date(),
    content: [{ type: 'text' as const, text }],
    metadata: { custom: {} },
  }

  if (role === 'user') {
    return { ...common, role, attachments: [] }
  }

  return {
    ...common,
    role,
    status: { type: 'complete', reason: 'stop' },
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom: {},
    },
  }
}

function createRunOptions(
  messages: readonly ThreadMessage[],
  abortSignal: AbortSignal = new AbortController().signal,
): ChatModelRunOptions {
  return {
    messages,
    runConfig: {},
    abortSignal,
    context: { system: '현재 PDF 5페이지를 읽고 있습니다.' },
    unstable_getMessage: () => {
      throw new Error('테스트에서 사용하지 않음')
    },
  }
}

function getText(result: ChatModelRunResult) {
  const textPart = result.content?.find((part) => part.type === 'text')
  return textPart?.type === 'text' ? textPart.text : undefined
}

function createEngine(chunks: string[]) {
  const create = vi.fn(async () => ({
    async *[Symbol.asyncIterator]() {
      for (const content of chunks) {
        yield { choices: [{ delta: { content } }] }
      }
    },
  }))
  const engine: WebLlmEngine = {
    chat: { completions: { create } },
    interruptGenerate: vi.fn(async () => undefined),
  }

  return { create, engine }
}

describe('createWebLlmChatModelAdapter', () => {
  it('전체 대화를 누적 스트리밍하고, 시스템 컨텍스트와 대화 이력을 엔진에 전달한다', async () => {
    const { create, engine } = createEngine(['반갑', '습니다'])
    const adapter = createWebLlmChatModelAdapter(async () => engine)
    const options = createRunOptions([
      createMessage('user', '안녕'),
      createMessage('assistant', '안녕하세요'),
      createMessage('user', '질문'),
    ])

    const texts = []
    for await (const result of adapter.run(options)) {
      texts.push(getText(result))
    }

    expect(texts).toEqual(['반갑', '반갑습니다'])
    expect(create).toHaveBeenCalledWith({
      messages: [
        { role: 'system', content: '현재 PDF 5페이지를 읽고 있습니다.' },
        { role: 'user', content: '안녕' },
        { role: 'assistant', content: '안녕하세요' },
        { role: 'user', content: '질문' },
      ],
      max_tokens: 512,
      stream: true,
    })
  })

  it('생성 중단을 WebLLM 엔진에 전달한다', async () => {
    const abortController = new AbortController()
    const { engine } = createEngine(['답변'])
    const adapter = createWebLlmChatModelAdapter(async () => engine)

    const results = adapter.run(
      createRunOptions([createMessage('user', '질문')], abortController.signal),
    )
    const firstResult = await results.next()
    if (firstResult.done) {
      throw new Error('첫 응답이 생성되지 않았습니다.')
    }
    abortController.abort()

    expect(getText(firstResult.value)).toBe('답변')
    expect(engine.interruptGenerate).toHaveBeenCalledOnce()
    await results.return()
  })

  it('모델 로딩 실패 후 재시도하면 엔진을 다시 불러온다', async () => {
    const { engine } = createEngine(['답변'])
    const loadEngine = vi
      .fn<() => Promise<WebLlmEngine>>()
      .mockRejectedValueOnce(new Error('모델 로딩 실패'))
      .mockResolvedValueOnce(engine)
    const adapter = createWebLlmChatModelAdapter(loadEngine)
    const options = createRunOptions([createMessage('user', '질문')])

    await expect(
      (async () => {
        for await (const _result of adapter.run(options)) {
          // 첫 실행은 모델 로딩 단계에서 실패해야 한다.
        }
      })(),
    ).rejects.toThrow('모델 로딩 실패')

    const texts = []
    for await (const result of adapter.run(options)) {
      texts.push(getText(result))
    }

    expect(texts).toEqual(['답변'])
    expect(loadEngine).toHaveBeenCalledTimes(2)
  })

  it('생성 중 실패하면 onEngineFailure를 호출하고, 이후 요청은 정상적으로 이어진다', async () => {
    const failingEngine: WebLlmEngine = {
      chat: {
        completions: {
          create: vi.fn(async () => {
            throw new Error('생성 실패')
          }),
        },
      },
      interruptGenerate: vi.fn(),
    }
    const { engine: workingEngine } = createEngine(['답변'])
    const loadEngine = vi
      .fn<() => Promise<WebLlmEngine>>()
      .mockResolvedValueOnce(failingEngine)
      .mockResolvedValueOnce(workingEngine)
    const onEngineFailure = vi.fn()
    const adapter = createWebLlmChatModelAdapter(loadEngine, onEngineFailure)
    const options = createRunOptions([createMessage('user', '질문')])

    await expect(
      (async () => {
        for await (const _result of adapter.run(options)) {
          // 첫 실행은 생성 단계에서 실패해야 한다.
        }
      })(),
    ).rejects.toThrow('생성 실패')

    expect(onEngineFailure).toHaveBeenCalledExactlyOnceWith(new Error('생성 실패'))

    const texts = []
    for await (const result of adapter.run(options)) {
      texts.push(getText(result))
    }

    expect(texts).toEqual(['답변'])
  })
})

// 프로덕션 어댑터가 모델 싱글턴과 제대로 연결됐는지 확인한다. 싱글턴이 모듈 범위에 있어 새 모듈을 불러온다.
describe('webLlmChatModelAdapter', () => {
  let restoreGpu: () => void

  beforeEach(() => {
    vi.resetModules()
    restoreGpu = stubSupportedGpu()
    stubWorker()
  })

  afterEach(() => {
    restoreGpu()
    vi.unstubAllGlobals()
    vi.doUnmock('@mlc-ai/web-llm')
  })

  it('모델을 다운로드하기 전에 질문하면 모델을 불러오지 않고 실패한다', async () => {
    const createWebWorkerMLCEngine = vi.fn()
    vi.doMock('@mlc-ai/web-llm', () => ({ CreateWebWorkerMLCEngine: createWebWorkerMLCEngine }))
    const { webLlmChatModelAdapter } = await import('./webllm-chat-adapter')
    const { useWebLlmModelStore } = await import('./webllm-model')
    const options = createRunOptions([createMessage('user', '질문')])

    await expect(
      (async () => {
        for await (const _result of webLlmChatModelAdapter.run(options)) {
          // 모델이 준비되지 않았으므로 응답 없이 실패해야 한다.
        }
      })(),
    ).rejects.toThrow('모델이 준비되지 않았습니다.')

    expect(createWebWorkerMLCEngine).not.toHaveBeenCalled()
    expect(useWebLlmModelStore.getState().status).toBe('idle')
  })

  it('모델 다운로드에 실패한 뒤 질문해도 다운로드를 다시 시작하지 않는다', async () => {
    const createWebWorkerMLCEngine = vi
      .fn()
      .mockRejectedValue(new Error('failed to fetch model shard'))
    vi.doMock('@mlc-ai/web-llm', () => ({ CreateWebWorkerMLCEngine: createWebWorkerMLCEngine }))
    const { webLlmChatModelAdapter } = await import('./webllm-chat-adapter')
    const { prepareWebLlmModel, useWebLlmModelStore } = await import('./webllm-model')
    const options = createRunOptions([createMessage('user', '질문')])
    await expect(prepareWebLlmModel()).rejects.toThrow()

    await expect(
      (async () => {
        for await (const _result of webLlmChatModelAdapter.run(options)) {
          // 모델이 준비되지 않았으므로 응답 없이 실패해야 한다.
        }
      })(),
    ).rejects.toThrow('모델이 준비되지 않았습니다.')

    expect(createWebWorkerMLCEngine).toHaveBeenCalledOnce()
    expect(useWebLlmModelStore.getState().status).toBe('error')
  })

  it('생성 중 엔진이 죽으면 상태가 초기화돼 재시도 시 모델을 다시 불러온다', async () => {
    const failingEngine: WebLlmEngine = {
      chat: {
        completions: {
          create: vi.fn(async () => {
            throw new Error('device lost during generation')
          }),
        },
      },
      interruptGenerate: vi.fn(),
    }
    const { engine: workingEngine } = createEngine(['답변'])
    const createWebWorkerMLCEngine = vi
      .fn()
      .mockResolvedValueOnce(failingEngine)
      .mockResolvedValueOnce(workingEngine)
    vi.doMock('@mlc-ai/web-llm', () => ({ CreateWebWorkerMLCEngine: createWebWorkerMLCEngine }))
    const { webLlmChatModelAdapter } = await import('./webllm-chat-adapter')
    const { prepareWebLlmModel, useWebLlmModelStore } = await import('./webllm-model')
    const options = createRunOptions([createMessage('user', '질문')])
    await prepareWebLlmModel()

    await expect(
      (async () => {
        for await (const _result of webLlmChatModelAdapter.run(options)) {
          // 생성 단계에서 실패해야 한다.
        }
      })(),
    ).rejects.toThrow('device lost during generation')

    expect(useWebLlmModelStore.getState().status).toBe('error')

    await prepareWebLlmModel()

    expect(useWebLlmModelStore.getState().status).toBe('ready')
    expect(createWebWorkerMLCEngine).toHaveBeenCalledTimes(2)
  })
})
