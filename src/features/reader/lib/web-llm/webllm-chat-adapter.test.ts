import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatModelRunOptions, ChatModelRunResult, ThreadMessage } from '@assistant-ui/react'
import { createPromiseController } from '../../../../test/promise-controller'
import {
  createWebLlmChatModelAdapter,
  WEBLLM_MODEL_ID,
  type WebLlmEngine,
} from './webllm-chat-adapter'
import type * as WebLlmModule from './webllm-chat-adapter'

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
    const loadEngine = vi.fn(async (modelId: string) => {
      expect(modelId).toBe(WEBLLM_MODEL_ID)
      return engine
    })
    const adapter = createWebLlmChatModelAdapter(loadEngine)
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
      .fn<(modelId: string) => Promise<WebLlmEngine>>()
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
      .fn<(modelId: string) => Promise<WebLlmEngine>>()
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

type GpuStub = { requestAdapter: () => Promise<{ features: ReadonlySet<string> } | null> }

function stubGpu(gpu: GpuStub | undefined) {
  const original = Object.getOwnPropertyDescriptor(navigator, 'gpu')
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: gpu })
  return () => {
    if (original) {
      Object.defineProperty(navigator, 'gpu', original)
    } else {
      Reflect.deleteProperty(navigator, 'gpu')
    }
  }
}

function stubSupportedGpu() {
  return stubGpu({
    requestAdapter: async () => ({ features: new Set(['shader-f16']) }),
  })
}

class FakeWorker extends EventTarget {
  terminate = vi.fn()
}

function stubWorker() {
  const instances: FakeWorker[] = []
  vi.stubGlobal(
    'Worker',
    class extends FakeWorker {
      constructor(..._args: unknown[]) {
        super()
        instances.push(this)
      }
    },
  )
  return instances
}

function mockCreateWebWorkerMLCEngine(createWebWorkerMLCEngine: unknown) {
  vi.doMock('@mlc-ai/web-llm', () => ({ CreateWebWorkerMLCEngine: createWebWorkerMLCEngine }))
}

async function importFreshModule() {
  return import('./webllm-chat-adapter') as Promise<typeof WebLlmModule>
}

describe('WebLLM 모델 로딩과 상태', () => {
  const restoreGpu: (() => void)[] = []

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    restoreGpu.splice(0).forEach((restore) => restore())
    vi.unstubAllGlobals()
    vi.doUnmock('@mlc-ai/web-llm')
  })

  it('WebGPU를 지원하지 않으면 에러 상태와 브라우저 안내 메시지를 남긴다', async () => {
    restoreGpu.push(stubGpu(undefined))
    stubWorker()
    const { prepareWebLlmModel, getWebLlmModelStatus, getWebLlmModelError } =
      await importFreshModule()

    await expect(prepareWebLlmModel()).rejects.toThrow()

    expect(getWebLlmModelStatus()).toBe('error')
    expect(getWebLlmModelError()).toBe(
      '이 브라우저나 기기에서 필요한 WebGPU 기능을 사용할 수 없습니다. 데스크톱 Chrome 또는 Edge에서 열어 주세요.',
    )
  })

  it('shader-f16을 지원하지 않으면 에러 상태와 브라우저 안내 메시지를 남긴다', async () => {
    restoreGpu.push(stubGpu({ requestAdapter: async () => ({ features: new Set() }) }))
    stubWorker()
    const { prepareWebLlmModel, getWebLlmModelStatus, getWebLlmModelError } =
      await importFreshModule()

    await expect(prepareWebLlmModel()).rejects.toThrow()

    expect(getWebLlmModelStatus()).toBe('error')
    expect(getWebLlmModelError()).toContain('WebGPU 기능을 사용할 수 없습니다')
  })

  it('모델 로딩 중 진행률을 갱신하고 완료되면 준비 완료 상태가 된다', async () => {
    restoreGpu.push(stubSupportedGpu())
    stubWorker()
    const engineController = createPromiseController<WebLlmEngine>()
    const createWebWorkerMLCEngine = vi.fn(
      async (
        _worker: unknown,
        _modelId: string,
        config: { initProgressCallback: (report: { progress: number }) => void },
      ) => {
        config.initProgressCallback({ progress: 0.5 })
        return engineController.promise
      },
    )
    mockCreateWebWorkerMLCEngine(createWebWorkerMLCEngine)
    const { prepareWebLlmModel, getWebLlmModelStatus, getWebLlmModelProgress } =
      await importFreshModule()

    const preparePromise = prepareWebLlmModel()
    await vi.waitFor(() => expect(getWebLlmModelProgress()).toBe(50))
    expect(getWebLlmModelStatus()).toBe('loading')

    engineController.resolve({
      chat: { completions: { create: vi.fn() } },
      interruptGenerate: vi.fn(),
    })
    await preparePromise

    expect(getWebLlmModelStatus()).toBe('ready')
    expect(getWebLlmModelProgress()).toBe(100)
  })

  it('이미 준비됐거나 로딩 중이면 모델을 다시 불러오지 않는다', async () => {
    restoreGpu.push(stubSupportedGpu())
    stubWorker()
    const createWebWorkerMLCEngine = vi.fn(async () => ({
      chat: { completions: { create: vi.fn() } },
      interruptGenerate: vi.fn(),
    }))
    mockCreateWebWorkerMLCEngine(createWebWorkerMLCEngine)
    const { prepareWebLlmModel } = await importFreshModule()

    await prepareWebLlmModel()
    await prepareWebLlmModel()

    expect(createWebWorkerMLCEngine).toHaveBeenCalledTimes(1)
  })

  it('네트워크 오류로 로딩에 실패하면 재시도 안내를 남기고, 재시도하면 다시 불러온다', async () => {
    restoreGpu.push(stubSupportedGpu())
    const workerInstances = stubWorker()
    const readyEngine = { chat: { completions: { create: vi.fn() } }, interruptGenerate: vi.fn() }
    const createWebWorkerMLCEngine = vi
      .fn()
      .mockRejectedValueOnce(new Error('failed to fetch model shard'))
      .mockResolvedValueOnce(readyEngine)
    mockCreateWebWorkerMLCEngine(createWebWorkerMLCEngine)
    const { prepareWebLlmModel, getWebLlmModelStatus, getWebLlmModelError } =
      await importFreshModule()

    await expect(prepareWebLlmModel()).rejects.toThrow()
    expect(getWebLlmModelStatus()).toBe('error')
    expect(getWebLlmModelError()).toBe(
      '모델 다운로드 연결에 실패했습니다. VPN이나 네트워크 설정을 확인하고 다시 시도해 주세요.',
    )
    expect(workerInstances[0]?.terminate).toHaveBeenCalledOnce()

    await prepareWebLlmModel()

    expect(getWebLlmModelStatus()).toBe('ready')
    expect(createWebWorkerMLCEngine).toHaveBeenCalledTimes(2)
  })

  it('GPU 메모리 부족으로 실패하면 원인에 맞는 안내를 남긴다', async () => {
    restoreGpu.push(stubSupportedGpu())
    stubWorker()
    mockCreateWebWorkerMLCEngine(
      vi.fn().mockRejectedValue(new Error('GPU device lost during allocation')),
    )
    const { prepareWebLlmModel, getWebLlmModelError } = await importFreshModule()

    await expect(prepareWebLlmModel()).rejects.toThrow()

    expect(getWebLlmModelError()).toBe(
      'GPU에서 모델을 실행하지 못했습니다. 다른 탭을 닫고 다시 시도해 주세요.',
    )
  })

  it('워커 로딩 중 오류가 발생하면 안내 메시지를 남긴다', async () => {
    restoreGpu.push(stubSupportedGpu())
    const workerInstances = stubWorker()
    mockCreateWebWorkerMLCEngine(vi.fn(() => new Promise(() => undefined)))
    const { prepareWebLlmModel, getWebLlmModelStatus, getWebLlmModelError } =
      await importFreshModule()

    const preparePromise = prepareWebLlmModel()
    await vi.waitFor(() => expect(workerInstances).toHaveLength(1))
    workerInstances[0]?.dispatchEvent(new Event('error'))

    await expect(preparePromise).rejects.toThrow()
    expect(getWebLlmModelStatus()).toBe('error')
    expect(getWebLlmModelError()).toBe(
      'AI를 실행하지 못했습니다. 페이지를 새로고침하고 다시 시도해 주세요.',
    )
  })

  it('생성 중 엔진이 죽으면 상태가 초기화돼 재시도 시 모델을 다시 불러온다', async () => {
    restoreGpu.push(stubSupportedGpu())
    stubWorker()
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
    mockCreateWebWorkerMLCEngine(createWebWorkerMLCEngine)
    const { webLlmChatModelAdapter, getWebLlmModelStatus, prepareWebLlmModel } =
      await importFreshModule()
    const options = createRunOptions([createMessage('user', '질문')])

    await expect(
      (async () => {
        for await (const _result of webLlmChatModelAdapter.run(options)) {
          // 생성 단계에서 실패해야 한다.
        }
      })(),
    ).rejects.toThrow('device lost during generation')

    expect(getWebLlmModelStatus()).toBe('error')

    await prepareWebLlmModel()

    expect(getWebLlmModelStatus()).toBe('ready')
    expect(createWebWorkerMLCEngine).toHaveBeenCalledTimes(2)
  })
})
