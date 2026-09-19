import type { ChatCompletionRequestStreaming } from '@mlc-ai/web-llm'
import { create } from 'zustand'

export const WEBLLM_MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'

// 어댑터가 실제로 쓰는 부분만 정의한다. 라이브러리의 ChatCompletionChunk를 그대로 쓰면
// 테스트 대역이 id·created 등 사용하지 않는 필드까지 모두 채워야 한다.
interface WebLlmChunk {
  choices: { delta: { content?: string | null } }[]
}

export interface WebLlmEngine {
  chat: {
    completions: {
      create(request: ChatCompletionRequestStreaming): Promise<AsyncIterable<WebLlmChunk>>
    }
  }
  interruptGenerate(): void
}

export type WebLlmModelStatus = 'idle' | 'loading' | 'ready' | 'error'

interface WebLlmModelState {
  status: WebLlmModelStatus
  progress: number
  error?: string
}

export const useWebLlmModelStore = create<WebLlmModelState>(() => ({
  status: 'idle',
  progress: 0,
}))

// 네트워크·다운로드 연결 문제로 보이는 오류는 일시적일 가능성이 있어 자동 재시도 대상으로도 함께 쓴다.
const NETWORK_ERROR_PATTERN = /fetch|network|download|ERR_FAILED|failed to load resource/i

// 최초 로딩 실패와 생성 도중 실패(invalidateDefaultEngine) 양쪽에서 공유하므로,
// "시작 실패"로 단정하는 문구 대신 두 경우 모두에 맞는 "실행 실패" 표현을 쓴다.
function getModelErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (/WebGPU|shader-f16|compatible GPU/i.test(message)) {
    return '이 브라우저나 기기에서 필요한 WebGPU 기능을 사용할 수 없습니다. 데스크톱 Chrome 또는 Edge에서 열어 주세요.'
  }
  // "GPU에서 메모리 부족으로 모델 다운로드 실패"처럼 메모리·네트워크 단어가 함께 나올 수 있어,
  // 더 구체적인 메모리 판별을 네트워크보다 먼저 검사한다.
  // 또한 "GPU"만 단독으로 들어간 메시지는 메모리와 무관한 경우가 많아(예: GPU 어댑터 조회 실패) 판별에서 제외한다.
  if (/memory|allocation|device lost/i.test(message)) {
    return 'GPU에서 모델을 실행하지 못했습니다. 다른 탭을 닫고 다시 시도해 주세요.'
  }
  if (NETWORK_ERROR_PATTERN.test(message)) {
    return '모델 다운로드 연결에 실패했습니다. VPN이나 네트워크 설정을 확인하고 다시 시도해 주세요.'
  }

  return 'AI를 실행하지 못했습니다. 페이지를 새로고침하고 다시 시도해 주세요.'
}

// GPU 미지원처럼 다시 시도해도 똑같이 실패하는 오류는 자동 재시도 대상에서 제외한다.
function isRetryableLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return NETWORK_ERROR_PATTERN.test(message)
}

async function assertWebGpuSupport() {
  const gpu = (
    navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<{ features: ReadonlySet<string> } | null> }
    }
  ).gpu
  if (!gpu) {
    throw new Error('WebGPU를 지원하지 않는 브라우저입니다.')
  }

  const adapter = await gpu.requestAdapter()
  if (!adapter || !adapter.features.has('shader-f16')) {
    throw new Error('필요한 GPU 기능(shader-f16)을 사용할 수 없습니다.')
  }
}

// 자동 재시도 횟수와 간격, 그리고 진행률이 멈춘 것으로 보는 기준 시간.
export const MAX_DOWNLOAD_ATTEMPTS = 3
export const RETRY_DELAY_MS = 2000
export const STALL_TIMEOUT_MS = 15000

let enginePromise: Promise<WebLlmEngine> | undefined
let worker: Worker | undefined

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

// 진행률이 STALL_TIMEOUT_MS 이상 움직이지 않으면 연결이 조용히 끊긴 것으로 보고 실패 처리한다.
// initProgressCallback이 호출될 때마다 reset()으로 타이머를 늦춘다.
function createStallWatcher(timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout>
  let rejectWatcher!: (error: Error) => void
  const promise = new Promise<never>((_, reject) => {
    rejectWatcher = reject
  })

  function reset() {
    clearTimeout(timer)
    timer = setTimeout(
      () => rejectWatcher(new Error('모델 다운로드가 지연되어 다시 연결합니다(download stalled).')),
      timeoutMs,
    )
  }

  reset()
  return { promise, reset, clear: () => clearTimeout(timer) }
}

async function attemptCreateEngine(): Promise<WebLlmEngine> {
  const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm')
  const currentWorker = new Worker(new URL('./webllm.worker.ts', import.meta.url), {
    type: 'module',
  })
  worker = currentWorker
  const workerFailed = new Promise<never>((_, reject) => {
    currentWorker.addEventListener(
      'error',
      () => reject(new Error('AI 실행 파일을 불러오지 못했습니다.')),
      { once: true },
    )
  })
  const stallWatcher = createStallWatcher(STALL_TIMEOUT_MS)

  try {
    return await Promise.race([
      CreateWebWorkerMLCEngine(currentWorker, WEBLLM_MODEL_ID, {
        initProgressCallback: ({ progress }) => {
          stallWatcher.reset()
          useWebLlmModelStore.setState({
            progress: Math.round(Math.max(0, Math.min(1, progress)) * 100),
          })
        },
      }),
      workerFailed,
      stallWatcher.promise,
    ])
  } finally {
    stallWatcher.clear()
  }
}

// 다운로드 연결이 일시적으로 끊긴 경우(네트워크 오류, 다운로드 정체)는 사용자가 매번 재시도
// 버튼을 누르지 않아도 되도록 자동으로 다시 시도한다. WebGPU 미지원처럼 다시 시도해도
// 똑같이 실패하는 오류는 바로 던진다.
async function createEngine(): Promise<WebLlmEngine> {
  await assertWebGpuSupport()

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await attemptCreateEngine()
    } catch (error) {
      worker?.terminate()
      worker = undefined
      if (attempt >= MAX_DOWNLOAD_ATTEMPTS || !isRetryableLoadError(error)) {
        throw error
      }
      useWebLlmModelStore.setState({ progress: 0 })
      await delay(RETRY_DELAY_MS)
    }
  }
}

export function invalidateDefaultEngine(error: unknown) {
  worker?.terminate()
  worker = undefined
  enginePromise = undefined
  useWebLlmModelStore.setState({ status: 'error', error: getModelErrorMessage(error) })
}

function loadDefaultEngine() {
  if (!enginePromise) {
    useWebLlmModelStore.setState({ status: 'loading', progress: 0, error: undefined })
    enginePromise = createEngine().then(
      (engine) => {
        useWebLlmModelStore.setState({ status: 'ready', progress: 100 })
        return engine
      },
      (error: unknown) => {
        invalidateDefaultEngine(error)
        throw error
      },
    )
  }

  return enginePromise
}

export async function prepareWebLlmModel() {
  await loadDefaultEngine()
}

// 실패한 다운로드가 손상된 조각을 캐시에 남겼을 수 있으므로, 재시도 전에 해당 모델의
// 캐시 항목을 모두 지운다. 정상적으로 완료된 모델까지 지우지 않도록 idle 상태의
// 첫 다운로드가 아니라 error 상태에서 재시도할 때만 호출한다.
export async function resetWebLlmModelCache() {
  const { deleteModelAllInfoInCache } = await import('@mlc-ai/web-llm')
  await deleteModelAllInfoInCache(WEBLLM_MODEL_ID)
  await prepareWebLlmModel()
}

// 모델 다운로드는 사용자가 다운로드 버튼으로 명시적으로 시작해야 한다.
// 채팅 요청이 로딩을 대신 시작하면 idle·error 상태에서 질문만 보내도 수백 MB 다운로드가 시작된다.
export async function getReadyEngine() {
  if (useWebLlmModelStore.getState().status !== 'ready' || !enginePromise) {
    throw new Error('모델이 준비되지 않았습니다. 먼저 모델을 다운로드해 주세요.')
  }

  return enginePromise
}
