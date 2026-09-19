import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPromiseController } from '../../../../test/promise-controller'
import { stubGpu, stubSupportedGpu, stubWorker } from '../../../../test/web-llm-stubs'
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
          config: { initProgressCallback: (report: { progress: number }) => void },
        ) => {
          config.initProgressCallback({ progress: 0.5 })
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

  it('네트워크 오류는 자동으로 재시도하다가, 계속 실패하면 안내를 남기고 재시도하면 다시 불러온다', async () => {
    vi.useFakeTimers()
    try {
      restoreGpu.push(stubSupportedGpu())
      const workerInstances = stubWorker()
      // mockRejectedValueOnce는 체이닝 시점에 즉시 거부된 Promise를 만들어, 실제로 호출되기까지
      // (재시도 대기 동안) 처리되지 않은 상태로 남아 unhandled rejection 경고를 유발한다.
      // 호출 시점에 던지는 mockImplementationOnce로 지연 생성한다.
      const createWebWorkerMLCEngine = vi
        .fn()
        .mockImplementationOnce(async () => {
          throw new Error('failed to fetch model shard')
        })
        .mockImplementationOnce(async () => {
          throw new Error('failed to fetch model shard')
        })
        .mockImplementationOnce(async () => {
          throw new Error('failed to fetch model shard')
        })
        .mockImplementationOnce(async () => createIdleEngine())
      mockCreateWebWorkerMLCEngine(createWebWorkerMLCEngine)
      const { prepareWebLlmModel, getState, RETRY_DELAY_MS, MAX_DOWNLOAD_ATTEMPTS } =
        await importFreshModule()

      const preparePromise = prepareWebLlmModel()
      // 가짜 타이머로 재시도를 진행하는 동안, 실패가 실제로 처리되기 전에 Node가 먼저
      // "처리되지 않은 거부"로 판단하지 않도록 핸들러를 미리 붙여 둔다. 아래 rejects.toThrow()가
      // 최종 검증을 맡으므로 여기서는 아무 것도 하지 않는다.
      preparePromise.catch(() => undefined)
      // 자동 재시도 사이의 대기 시간을 흘려보내 MAX_DOWNLOAD_ATTEMPTS번 모두 실패하게 한다.
      for (let attempt = 1; attempt < MAX_DOWNLOAD_ATTEMPTS; attempt += 1) {
        await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)
      }

      await expect(preparePromise).rejects.toThrow()
      expect(getState()).toMatchObject({ status: 'error', error: NETWORK_ERROR_MESSAGE })
      expect(createWebWorkerMLCEngine).toHaveBeenCalledTimes(MAX_DOWNLOAD_ATTEMPTS)
      workerInstances
        .slice(0, MAX_DOWNLOAD_ATTEMPTS)
        .forEach((instance) => expect(instance.terminate).toHaveBeenCalledOnce())

      await prepareWebLlmModel()

      expect(getState().status).toBe('ready')
      expect(createWebWorkerMLCEngine).toHaveBeenCalledTimes(MAX_DOWNLOAD_ATTEMPTS + 1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('다운로드 진행률이 일정 시간 멈추면 정체로 보고 자동으로 다시 연결한다', async () => {
    vi.useFakeTimers()
    try {
      restoreGpu.push(stubSupportedGpu())
      stubWorker()
      let callCount = 0
      const createWebWorkerMLCEngine = vi.fn(
        async (
          _worker: unknown,
          _modelId: string,
          config: { initProgressCallback: (report: { progress: number }) => void },
        ) => {
          callCount += 1
          if (callCount === 1) {
            config.initProgressCallback({ progress: 0.2 })
            // 첫 시도는 진행률만 찍고 응답 없이 멈춘 상황을 흉내 낸다.
            return new Promise<never>(() => undefined)
          }
          return createIdleEngine()
        },
      )
      mockCreateWebWorkerMLCEngine(createWebWorkerMLCEngine)
      const { prepareWebLlmModel, getState, RETRY_DELAY_MS, STALL_TIMEOUT_MS } =
        await importFreshModule()

      const preparePromise = prepareWebLlmModel()
      await vi.advanceTimersByTimeAsync(0)
      expect(getState()).toMatchObject({ status: 'loading', progress: 20 })

      await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS)
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS)
      await preparePromise

      expect(getState().status).toBe('ready')
      expect(createWebWorkerMLCEngine).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('resetWebLlmModelCache는 캐시를 지운 뒤 모델을 다시 불러온다', async () => {
    restoreGpu.push(stubSupportedGpu())
    stubWorker()
    const deleteModelAllInfoInCache = vi.fn(async () => undefined)
    const createWebWorkerMLCEngine = vi.fn(async () => createIdleEngine())
    vi.doMock('@mlc-ai/web-llm', () => ({
      CreateWebWorkerMLCEngine: createWebWorkerMLCEngine,
      deleteModelAllInfoInCache,
    }))
    const { resetWebLlmModelCache, getState } = await importFreshModule()

    await resetWebLlmModelCache()

    expect(deleteModelAllInfoInCache).toHaveBeenCalledWith('Qwen2.5-1.5B-Instruct-q4f16_1-MLC')
    expect(getState().status).toBe('ready')
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
})
