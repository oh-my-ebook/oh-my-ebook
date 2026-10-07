import type { ChatCompletionRequestStreaming, InitProgressReport } from '@mlc-ai/web-llm'
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
export type WebLlmModelPhase = 'preparing' | 'downloading' | 'loading-gpu' | 'compiling'

interface WebLlmModelState {
  status: WebLlmModelStatus
  progress: number
  phase: WebLlmModelPhase
  progressDetail?: string
  error?: string
}

export const useWebLlmModelStore = create<WebLlmModelState>(() => ({
  status: 'idle',
  progress: 0,
  phase: 'preparing',
}))

function getLoadingProgress({ text, progress }: InitProgressReport) {
  const phase: WebLlmModelPhase = text.startsWith('Fetching param cache')
    ? 'downloading'
    : text.startsWith('Loading model from cache')
      ? 'loading-gpu'
      : text.startsWith('Loading GPU shader modules')
        ? 'compiling'
        : 'preparing'
  const count = text.match(/\[(\d+\/\d+)\]/)?.[1]
  const megabytes = text.match(/(\d+)MB (?:fetched|loaded)/)?.[1]
  const progressDetail =
    phase === 'preparing'
      ? undefined
      : [
          count && `${count}개${phase === 'compiling' ? '' : ' 파일'}`,
          megabytes && `${megabytes}MB`,
        ]
          .filter(Boolean)
          .join(' · ') || undefined

  return { phase, progress: Math.round(Math.max(0, Math.min(1, progress)) * 100), progressDetail }
}

// 최초 로딩 실패와 생성 도중 실패(invalidateDefaultEngine) 양쪽에서 공유하므로,
// "시작 실패"로 단정하는 문구 대신 두 경우 모두에 맞는 "실행 실패" 표현을 쓴다.
function getModelErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (/WebGPU|shader-f16|compatible GPU/i.test(message)) {
    return '이 브라우저나 기기에서 필요한 WebGPU 기능을 사용할 수 없습니다. 데스크톱 Chrome 또는 Edge에서 열어 주세요.'
  }
  if (/Cache\.add|execute ['"]add['"] on ['"]Cache['"]/i.test(message)) {
    return '모델 파일을 브라우저에 저장하지 못했습니다. 기기 저장 공간을 확보한 뒤 다시 시도해 주세요. 계속 실패하면 VPN이나 네트워크 설정을 확인해 주세요.'
  }
  // "GPU에서 메모리 부족으로 모델 다운로드 실패"처럼 메모리·네트워크 단어가 함께 나올 수 있어,
  // 더 구체적인 메모리 판별을 네트워크보다 먼저 검사한다.
  // 또한 "GPU"만 단독으로 들어간 메시지는 메모리와 무관한 경우가 많아(예: GPU 어댑터 조회 실패) 판별에서 제외한다.
  if (/memory|allocation|device lost/i.test(message)) {
    return 'GPU에서 모델을 실행하지 못했습니다. 다른 탭을 닫고 다시 시도해 주세요.'
  }
  if (/fetch|network|download|ERR_FAILED|failed to load resource/i.test(message)) {
    return '모델 다운로드 연결에 실패했습니다. VPN이나 네트워크 설정을 확인하고 다시 시도해 주세요.'
  }

  return 'AI를 실행하지 못했습니다. 페이지를 새로고침하고 다시 시도해 주세요.'
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

let enginePromise: Promise<WebLlmEngine> | undefined
let worker: Worker | undefined

async function createEngine(): Promise<WebLlmEngine> {
  await assertWebGpuSupport()

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

  return Promise.race([
    CreateWebWorkerMLCEngine(
      currentWorker,
      WEBLLM_MODEL_ID,
      {
        initProgressCallback: (report) => {
          useWebLlmModelStore.setState(getLoadingProgress(report))
        },
      },
      { context_window_size: 8192 },
    ),
    workerFailed,
  ])
}

export function invalidateDefaultEngine(error: unknown) {
  worker?.terminate()
  worker = undefined
  enginePromise = undefined
  useWebLlmModelStore.setState({ status: 'error', error: getModelErrorMessage(error) })
}

function loadDefaultEngine() {
  if (!enginePromise) {
    useWebLlmModelStore.setState({
      status: 'loading',
      phase: 'preparing',
      progress: 0,
      progressDetail: undefined,
      error: undefined,
    })
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

export async function prepareCachedWebLlmModel() {
  if (typeof caches === 'undefined' || useWebLlmModelStore.getState().status !== 'idle') return
  if (!(await caches.has('webllm/model'))) return

  const { hasModelInCache } = await import('@mlc-ai/web-llm')
  // 일부만 받은 모델은 자동 다운로드하지 않는다. 라이브러리가 모든 가중치 파일을 확인한다.
  const cached = await hasModelInCache(WEBLLM_MODEL_ID)
  if (cached && useWebLlmModelStore.getState().status === 'idle') {
    await loadDefaultEngine()
  }
}

// 캐시가 없는 모델 다운로드는 사용자가 다운로드 버튼으로 명시적으로 시작해야 한다.
// 채팅 요청이 로딩을 대신 시작하면 idle·error 상태에서 질문만 보내도 수백 MB 다운로드가 시작된다.
export async function getReadyEngine() {
  if (useWebLlmModelStore.getState().status !== 'ready' || !enginePromise) {
    throw new Error('모델이 준비되지 않았습니다. 먼저 모델을 다운로드해 주세요.')
  }

  return enginePromise
}
