import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { createPromiseController } from '@/test/promise-controller'
import { stubGpu, stubSupportedGpu, stubWorker } from '@/test/web-llm-stubs'
import type { InitProgressReport } from '@mlc-ai/web-llm'
import { WEBLLM_MODEL_ID, WebLlmProvider } from './web-llm.provider'
import type { WebLlmEngine } from './web-llm.type'

const NETWORK_ERROR_MESSAGE =
  '모델 다운로드 연결에 실패했습니다. VPN이나 네트워크 설정을 확인하고 다시 시도해 주세요.'
const CACHE_ERROR_MESSAGE =
  '모델 파일을 브라우저에 저장하지 못했습니다. 기기 저장 공간을 확보한 뒤 다시 시도해 주세요. 계속 실패하면 VPN이나 네트워크 설정을 확인해 주세요.'
const GPU_MEMORY_ERROR_MESSAGE =
  'GPU에서 모델을 실행하지 못했습니다. 다른 탭을 닫고 다시 시도해 주세요.'
const UNKNOWN_ERROR_MESSAGE = 'AI를 실행하지 못했습니다. 페이지를 새로고침하고 다시 시도해 주세요.'

function createIdleEngine(): WebLlmEngine {
  return { chat: { completions: { create: vi.fn() } }, interruptGenerate: vi.fn() }
}

function mockCreateWebWorkerMLCEngine(createWebWorkerMLCEngine: unknown) {
  vi.doMock('@mlc-ai/web-llm', () => ({ CreateWebWorkerMLCEngine: createWebWorkerMLCEngine }))
}

describe('WebLLM 모델 로딩과 상태', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('@mlc-ai/web-llm')
  })

  it('WebGPU를 지원하지 않으면 에러 상태와 브라우저 안내 메시지를 남긴다', async () => {
    onTestFinished(stubGpu(undefined))
    stubWorker()
    const provider = new WebLlmProvider()

    await expect(provider.prepareModel()).rejects.toThrow()

    expect(provider.modelStore.getState()).toMatchObject({
      status: 'error',
      error:
        '이 브라우저나 기기에서 필요한 WebGPU 기능을 사용할 수 없습니다. 데스크톱 Chrome 또는 Edge에서 열어 주세요.',
    })
  })

  it('shader-f16을 지원하지 않으면 에러 상태와 브라우저 안내 메시지를 남긴다', async () => {
    onTestFinished(stubGpu({ requestAdapter: async () => ({ features: new Set() }) }))
    stubWorker()
    const provider = new WebLlmProvider()

    await expect(provider.prepareModel()).rejects.toThrow()

    expect(provider.modelStore.getState().status).toBe('error')
    expect(provider.modelStore.getState().error).toContain('WebGPU 기능을 사용할 수 없습니다')
  })

  it('모델 로딩 중 진행률을 갱신하고 완료되면 준비 완료 상태가 된다', async () => {
    onTestFinished(stubSupportedGpu())
    stubWorker()
    const engineController = createPromiseController<WebLlmEngine>()
    mockCreateWebWorkerMLCEngine(
      vi.fn(
        async (
          _worker: unknown,
          _modelId: string,
          config: { initProgressCallback: (report: InitProgressReport) => void },
        ) => {
          config.initProgressCallback({
            progress: 0.5,
            text: 'Fetching param cache[15/30]: 414MB fetched.',
            timeElapsed: 10,
          })
          return engineController.promise
        },
      ),
    )
    const provider = new WebLlmProvider()

    const preparePromise = provider.prepareModel()
    await vi.waitFor(() => expect(provider.modelStore.getState().progress).toBe(50))
    expect(provider.modelStore.getState().status).toBe('loading')

    engineController.resolve(createIdleEngine())
    await preparePromise

    expect(provider.modelStore.getState()).toMatchObject({ status: 'ready', progress: 100 })
  })

  it('이미 준비됐거나 로딩 중이면 모델을 다시 불러오지 않는다', async () => {
    onTestFinished(stubSupportedGpu())
    stubWorker()
    const createWebWorkerMLCEngine = vi.fn(async () => createIdleEngine())
    mockCreateWebWorkerMLCEngine(createWebWorkerMLCEngine)
    const provider = new WebLlmProvider()

    await provider.prepareModel()
    await provider.prepareModel()

    expect(createWebWorkerMLCEngine).toHaveBeenCalledTimes(1)
  })

  it('별도로 만든 Provider는 모델 준비 상태와 엔진을 각각 관리한다', async () => {
    onTestFinished(stubSupportedGpu())
    stubWorker()
    mockCreateWebWorkerMLCEngine(vi.fn(async () => createIdleEngine()))
    const firstProvider = new WebLlmProvider()
    const secondProvider = new WebLlmProvider()

    await firstProvider.prepareModel()

    expect(firstProvider.modelStore.getState().status).toBe('ready')
    expect(secondProvider.modelStore.getState().status).toBe('idle')
    await expect(secondProvider.getReadyEngine()).rejects.toThrow('모델이 준비되지 않았습니다.')

    await secondProvider.prepareModel()

    expect(await firstProvider.getReadyEngine()).not.toBe(await secondProvider.getReadyEngine())
  })

  it('모델을 8192토큰 컨텍스트로 불러온다', async () => {
    onTestFinished(stubSupportedGpu())
    stubWorker()
    const createWebWorkerMLCEngine = vi.fn(async () => createIdleEngine())
    mockCreateWebWorkerMLCEngine(createWebWorkerMLCEngine)
    const provider = new WebLlmProvider()

    await provider.prepareModel()

    expect(createWebWorkerMLCEngine).toHaveBeenCalledWith(
      expect.anything(),
      WEBLLM_MODEL_ID,
      expect.any(Object),
      { context_window_size: 8192 },
    )
  })

  it('네트워크 오류로 로딩에 실패하면 재시도 안내를 남기고, 재시도하면 다시 불러온다', async () => {
    onTestFinished(stubSupportedGpu())
    const workerInstances = stubWorker()
    const createWebWorkerMLCEngine = vi
      .fn()
      .mockRejectedValueOnce(new Error('failed to fetch model shard'))
      .mockResolvedValueOnce(createIdleEngine())
    mockCreateWebWorkerMLCEngine(createWebWorkerMLCEngine)
    const provider = new WebLlmProvider()

    await expect(provider.prepareModel()).rejects.toThrow()
    expect(provider.modelStore.getState()).toMatchObject({
      status: 'error',
      error: NETWORK_ERROR_MESSAGE,
    })
    expect(workerInstances[0]?.terminate).toHaveBeenCalledOnce()

    await provider.prepareModel()

    expect(provider.modelStore.getState().status).toBe('ready')
    expect(createWebWorkerMLCEngine).toHaveBeenCalledTimes(2)
  })

  it.each([
    [
      '브라우저 캐시 저장 실패',
      "Failed to execute 'add' on 'Cache': Cache.add() encountered a network error",
      CACHE_ERROR_MESSAGE,
    ],
    ['GPU 메모리 부족', 'GPU device lost during allocation', GPU_MEMORY_ERROR_MESSAGE],
    // 메모리와 다운로드 단어가 함께 나와도 네트워크 오류로 잘못 안내하지 않는다.
    [
      '다운로드 중 메모리 부족',
      'out of memory while downloading model shard',
      GPU_MEMORY_ERROR_MESSAGE,
    ],
    // "GPU"만 언급된 오류는 GPU 메모리 안내로 단정하지 않는다.
    ['메모리와 무관한 GPU 오류', 'failed to query GPU vendor', UNKNOWN_ERROR_MESSAGE],
  ])('%s 오류는 원인에 맞는 안내를 남긴다', async (_case, rawMessage, expectedMessage) => {
    onTestFinished(stubSupportedGpu())
    stubWorker()
    mockCreateWebWorkerMLCEngine(vi.fn().mockRejectedValue(new Error(rawMessage)))
    const provider = new WebLlmProvider()

    await expect(provider.prepareModel()).rejects.toThrow()

    expect(provider.modelStore.getState().error).toBe(expectedMessage)
  })

  it('워커 로딩 중 오류가 발생하면 안내 메시지를 남긴다', async () => {
    onTestFinished(stubSupportedGpu())
    const workerInstances = stubWorker()
    mockCreateWebWorkerMLCEngine(vi.fn(() => new Promise(() => undefined)))
    const provider = new WebLlmProvider()

    const preparePromise = provider.prepareModel()
    await vi.waitFor(() => expect(workerInstances).toHaveLength(1))
    workerInstances[0]?.dispatchEvent(new Event('error'))

    await expect(preparePromise).rejects.toThrow()
    expect(provider.modelStore.getState()).toMatchObject({
      status: 'error',
      error: UNKNOWN_ERROR_MESSAGE,
    })
  })

  it('다운로드와 GPU 로딩·실행 준비의 진행률을 구분하고 이전 단계의 상세를 지운다', async () => {
    onTestFinished(stubSupportedGpu())
    stubWorker()
    const controller = createPromiseController<WebLlmEngine>()
    const createEngine = vi.fn(
      async (
        _worker: unknown,
        _model: string,
        config: {
          initProgressCallback: (report: InitProgressReport) => void
        },
      ) => {
        config.initProgressCallback({
          progress: 1,
          text: 'Fetching param cache[30/30]: 829MB fetched.',
          timeElapsed: 30,
        })
        return controller.promise
      },
    )
    mockCreateWebWorkerMLCEngine(createEngine)
    const provider = new WebLlmProvider()
    const loading = provider.prepareModel()
    await vi.waitFor(() =>
      expect(provider.modelStore.getState()).toMatchObject({
        status: 'loading',
        phase: 'downloading',
        progress: 100,
        progressDetail: '30/30개 파일 · 829MB',
      }),
    )
    const report = createEngine.mock.calls[0]?.[2].initProgressCallback
    if (!report) throw new Error('진행률 콜백이 없습니다.')

    report({
      progress: 0.25,
      text: 'Loading model from cache[4/30]: 208MB loaded.',
      timeElapsed: 2,
    })
    expect(provider.modelStore.getState()).toMatchObject({
      phase: 'loading-gpu',
      progress: 25,
      progressDetail: '4/30개 파일 · 208MB',
    })
    report({
      progress: 0.5,
      text: 'Loading GPU shader modules[10/20]: 50% completed, 1 secs elapsed.',
      timeElapsed: 1,
    })
    expect(provider.modelStore.getState()).toMatchObject({
      phase: 'compiling',
      progress: 50,
      progressDetail: '10/20개',
    })
    report({ progress: 0, text: 'An unknown future phase', timeElapsed: 0 })
    expect(provider.modelStore.getState()).toMatchObject({
      phase: 'preparing',
      progress: 0,
      progressDetail: undefined,
    })

    controller.resolve(createIdleEngine())
    await loading
    expect(provider.modelStore.getState().status).toBe('ready')
  })

  it.each([false, true])(
    '완전한 모델 캐시 여부(%s)에 따라 자동 준비를 결정한다',
    async (cached) => {
      onTestFinished(stubSupportedGpu())
      stubWorker()
      vi.stubGlobal('caches', { has: async () => true })
      const createEngine = vi.fn(async () => createIdleEngine())
      const hasModelInCache = vi.fn(async () => cached)
      vi.doMock('@mlc-ai/web-llm', () => ({
        CreateWebWorkerMLCEngine: createEngine,
        hasModelInCache,
      }))
      const provider = new WebLlmProvider()

      await provider.prepareCachedModel()

      expect(hasModelInCache).toHaveBeenCalledWith(WEBLLM_MODEL_ID)
      expect(provider.modelStore.getState().status).toBe(cached ? 'ready' : 'idle')
      expect(createEngine).toHaveBeenCalledTimes(cached ? 1 : 0)
    },
  )

  it('캐시 확인이 실패해도 수동 다운로드는 가능하다', async () => {
    onTestFinished(stubSupportedGpu())
    stubWorker()
    vi.stubGlobal('caches', { has: async () => true })
    const createEngine = vi.fn(async () => createIdleEngine())
    vi.doMock('@mlc-ai/web-llm', () => ({
      CreateWebWorkerMLCEngine: createEngine,
      hasModelInCache: vi.fn().mockRejectedValue(new Error('cache unavailable')),
    }))
    const provider = new WebLlmProvider()

    await expect(provider.prepareCachedModel()).rejects.toThrow('cache unavailable')
    expect(provider.modelStore.getState().status).toBe('idle')
    expect(createEngine).not.toHaveBeenCalled()
    await provider.prepareModel()
    expect(provider.modelStore.getState().status).toBe('ready')
  })

  it('캐시 확인 도중 수동 준비가 시작되면 엔진을 중복 생성하지 않는다', async () => {
    onTestFinished(stubSupportedGpu())
    stubWorker()
    vi.stubGlobal('caches', { has: async () => true })
    const cache = createPromiseController<boolean>()
    const engine = createPromiseController<WebLlmEngine>()
    const createEngine = vi.fn(() => engine.promise)
    const hasModelInCache = vi.fn(() => cache.promise)
    vi.doMock('@mlc-ai/web-llm', () => ({
      CreateWebWorkerMLCEngine: createEngine,
      hasModelInCache,
    }))
    const provider = new WebLlmProvider()

    const automatic = provider.prepareCachedModel()
    await vi.waitFor(() => expect(hasModelInCache).toHaveBeenCalled())
    const manual = provider.prepareModel()
    cache.resolve(true)
    await automatic
    engine.resolve(createIdleEngine())
    await manual

    expect(provider.modelStore.getState().status).toBe('ready')
    expect(createEngine).toHaveBeenCalledOnce()
  })

  it('자동 GPU 준비가 실패하면 재시도할 수 있고 자동으로 반복하지 않는다', async () => {
    onTestFinished(stubSupportedGpu())
    const workers = stubWorker()
    vi.stubGlobal('caches', { has: async () => true })
    const createEngine = vi
      .fn()
      .mockRejectedValueOnce(new Error('GPU device lost'))
      .mockResolvedValueOnce(createIdleEngine())
    vi.doMock('@mlc-ai/web-llm', () => ({
      CreateWebWorkerMLCEngine: createEngine,
      hasModelInCache: vi.fn(async () => true),
    }))
    const provider = new WebLlmProvider()

    await expect(provider.prepareCachedModel()).rejects.toThrow('GPU device lost')
    await provider.prepareCachedModel()
    expect(provider.modelStore.getState()).toMatchObject({
      status: 'error',
      error: GPU_MEMORY_ERROR_MESSAGE,
    })
    expect(createEngine).toHaveBeenCalledOnce()
    expect(workers[0]?.terminate).toHaveBeenCalledOnce()
    await provider.prepareModel()
    expect(provider.modelStore.getState().status).toBe('ready')
  })

  it('Cache Storage가 없으면 자동 준비를 건너뛴다', async () => {
    vi.stubGlobal('caches', undefined)
    const createEngine = vi.fn()
    mockCreateWebWorkerMLCEngine(createEngine)
    const provider = new WebLlmProvider()
    await provider.prepareCachedModel()
    expect(provider.modelStore.getState().status).toBe('idle')
    expect(createEngine).not.toHaveBeenCalled()
  })

  it('모델 캐시 저장소가 없으면 WebLLM 모듈도 불러오지 않는다', async () => {
    vi.stubGlobal('caches', { has: async () => false })
    const loadLibrary = vi.fn(() => ({ hasModelInCache: vi.fn() }))
    vi.doMock('@mlc-ai/web-llm', loadLibrary)
    const provider = new WebLlmProvider()

    await provider.prepareCachedModel()

    expect(loadLibrary).not.toHaveBeenCalled()
    expect(provider.modelStore.getState().status).toBe('idle')
  })
})
