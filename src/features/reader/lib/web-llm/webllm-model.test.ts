import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPromiseController } from '../../../../test/promise-controller'
import { stubGpu, stubSupportedGpu, stubWorker } from '../../../../test/web-llm-stubs'
import type { InitProgressReport } from '@mlc-ai/web-llm'
import type { WebLlmEngine } from './webllm-model'

const NETWORK_ERROR_MESSAGE =
  '모델 다운로드 연결에 실패했습니다. VPN이나 네트워크 설정을 확인하고 다시 시도해 주세요.'
const GPU_MEMORY_ERROR_MESSAGE =
  'GPU에서 모델을 실행하지 못했습니다. 다른 탭을 닫고 다시 시도해 주세요.'
const UNKNOWN_ERROR_MESSAGE = 'AI를 실행하지 못했습니다. 페이지를 새로고침하고 다시 시도해 주세요.'

function createIdleEngine(): WebLlmEngine {
  return { chat: { completions: { create: vi.fn() } }, interruptGenerate: vi.fn() }
}

function mockCreateWebWorkerMLCEngine(createWebWorkerMLCEngine: unknown) {
  vi.doMock('@mlc-ai/web-llm', () => ({ CreateWebWorkerMLCEngine: createWebWorkerMLCEngine }))
}

// 엔진 캐시와 상태 store가 모듈 범위에 있으므로 테스트마다 새 모듈을 불러온다.
async function importFreshModule() {
  const module = await import('./webllm-model')
  return { ...module, getState: () => module.useWebLlmModelStore.getState() }
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
    const { prepareWebLlmModel, getState } = await importFreshModule()

    await expect(prepareWebLlmModel()).rejects.toThrow()

    expect(getState()).toMatchObject({
      status: 'error',
      error:
        '이 브라우저나 기기에서 필요한 WebGPU 기능을 사용할 수 없습니다. 데스크톱 Chrome 또는 Edge에서 열어 주세요.',
    })
  })

  it('shader-f16을 지원하지 않으면 에러 상태와 브라우저 안내 메시지를 남긴다', async () => {
    restoreGpu.push(stubGpu({ requestAdapter: async () => ({ features: new Set() }) }))
    stubWorker()
    const { prepareWebLlmModel, getState } = await importFreshModule()

    await expect(prepareWebLlmModel()).rejects.toThrow()

    expect(getState().status).toBe('error')
    expect(getState().error).toContain('WebGPU 기능을 사용할 수 없습니다')
  })

  it('모델 로딩 중 진행률을 갱신하고 완료되면 준비 완료 상태가 된다', async () => {
    restoreGpu.push(stubSupportedGpu())
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
    const { prepareWebLlmModel, getState } = await importFreshModule()

    const preparePromise = prepareWebLlmModel()
    await vi.waitFor(() => expect(getState().progress).toBe(50))
    expect(getState().status).toBe('loading')

    engineController.resolve(createIdleEngine())
    await preparePromise

    expect(getState()).toMatchObject({ status: 'ready', progress: 100 })
  })

  it('이미 준비됐거나 로딩 중이면 모델을 다시 불러오지 않는다', async () => {
    restoreGpu.push(stubSupportedGpu())
    stubWorker()
    const createWebWorkerMLCEngine = vi.fn(async () => createIdleEngine())
    mockCreateWebWorkerMLCEngine(createWebWorkerMLCEngine)
    const { prepareWebLlmModel } = await importFreshModule()

    await prepareWebLlmModel()
    await prepareWebLlmModel()

    expect(createWebWorkerMLCEngine).toHaveBeenCalledTimes(1)
  })

  it('모델을 8192토큰 컨텍스트로 불러온다', async () => {
    restoreGpu.push(stubSupportedGpu())
    stubWorker()
    const createWebWorkerMLCEngine = vi.fn(async () => createIdleEngine())
    mockCreateWebWorkerMLCEngine(createWebWorkerMLCEngine)
    const { prepareWebLlmModel, WEBLLM_MODEL_ID } = await importFreshModule()

    await prepareWebLlmModel()

    expect(createWebWorkerMLCEngine).toHaveBeenCalledWith(
      expect.anything(),
      WEBLLM_MODEL_ID,
      expect.any(Object),
      { context_window_size: 8192 },
    )
  })

  it('네트워크 오류로 로딩에 실패하면 재시도 안내를 남기고, 재시도하면 다시 불러온다', async () => {
    restoreGpu.push(stubSupportedGpu())
    const workerInstances = stubWorker()
    const createWebWorkerMLCEngine = vi
      .fn()
      .mockRejectedValueOnce(new Error('failed to fetch model shard'))
      .mockResolvedValueOnce(createIdleEngine())
    mockCreateWebWorkerMLCEngine(createWebWorkerMLCEngine)
    const { prepareWebLlmModel, getState } = await importFreshModule()

    await expect(prepareWebLlmModel()).rejects.toThrow()
    expect(getState()).toMatchObject({ status: 'error', error: NETWORK_ERROR_MESSAGE })
    expect(workerInstances[0]?.terminate).toHaveBeenCalledOnce()

    await prepareWebLlmModel()

    expect(getState().status).toBe('ready')
    expect(createWebWorkerMLCEngine).toHaveBeenCalledTimes(2)
  })

  it.each([
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
    restoreGpu.push(stubSupportedGpu())
    stubWorker()
    mockCreateWebWorkerMLCEngine(vi.fn().mockRejectedValue(new Error(rawMessage)))
    const { prepareWebLlmModel, getState } = await importFreshModule()

    await expect(prepareWebLlmModel()).rejects.toThrow()

    expect(getState().error).toBe(expectedMessage)
  })

  it('워커 로딩 중 오류가 발생하면 안내 메시지를 남긴다', async () => {
    restoreGpu.push(stubSupportedGpu())
    const workerInstances = stubWorker()
    mockCreateWebWorkerMLCEngine(vi.fn(() => new Promise(() => undefined)))
    const { prepareWebLlmModel, getState } = await importFreshModule()

    const preparePromise = prepareWebLlmModel()
    await vi.waitFor(() => expect(workerInstances).toHaveLength(1))
    workerInstances[0]?.dispatchEvent(new Event('error'))

    await expect(preparePromise).rejects.toThrow()
    expect(getState()).toMatchObject({ status: 'error', error: UNKNOWN_ERROR_MESSAGE })
  })

  it('다운로드와 GPU 로딩·실행 준비의 진행률을 구분하고 이전 단계의 상세를 지운다', async () => {
    restoreGpu.push(stubSupportedGpu())
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
    const { prepareWebLlmModel, getState } = await importFreshModule()
    const loading = prepareWebLlmModel()
    await vi.waitFor(() =>
      expect(getState()).toMatchObject({
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
    expect(getState()).toMatchObject({
      phase: 'loading-gpu',
      progress: 25,
      progressDetail: '4/30개 파일 · 208MB',
    })
    report({
      progress: 0.5,
      text: 'Loading GPU shader modules[10/20]: 50% completed, 1 secs elapsed.',
      timeElapsed: 1,
    })
    expect(getState()).toMatchObject({
      phase: 'compiling',
      progress: 50,
      progressDetail: '10/20개',
    })
    report({ progress: 0, text: 'An unknown future phase', timeElapsed: 0 })
    expect(getState()).toMatchObject({ phase: 'preparing', progress: 0, progressDetail: undefined })

    controller.resolve(createIdleEngine())
    await loading
    expect(getState().status).toBe('ready')
  })
})
