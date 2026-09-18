import type {
  ChatModelRunOptions,
  ChatModelRunResult,
  TextMessagePart,
  ThreadMessage,
} from '@assistant-ui/react'
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm'

export const WEBLLM_MODEL_ID = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'

interface WebLlmChunk {
  choices: { delta: { content?: string | null } }[]
}

interface WebLlmRequest {
  messages: ChatCompletionMessageParam[]
  max_tokens: number
  stream: true
}

export interface WebLlmEngine {
  chat: {
    completions: {
      create(request: WebLlmRequest): Promise<AsyncIterable<WebLlmChunk>>
    }
  }
  interruptGenerate(): void
}

type LoadEngine = (modelId: string) => Promise<WebLlmEngine>
export type WebLlmModelStatus = 'idle' | 'loading' | 'ready' | 'error'

interface WebLlmChatModelAdapter {
  run(options: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult, void>
}

function isTextPart(part: { type: string }): part is TextMessagePart {
  return part.type === 'text'
}

function getText(message: ThreadMessage) {
  return message.content
    .filter(isTextPart)
    .map((part) => part.text)
    .join('')
}

function toWebLlmMessages({ context, messages }: ChatModelRunOptions) {
  const result: ChatCompletionMessageParam[] = []

  if (context.system) {
    result.push({ role: 'system', content: context.system })
  }

  for (const message of messages) {
    const content = getText(message)
    if (message.role === 'system') {
      result.push({ role: 'system', content })
    } else if (message.role === 'user') {
      result.push({ role: 'user', content })
    } else {
      result.push({ role: 'assistant', content })
    }
  }

  return result
}

async function loadWebLlmEngine(modelId: string): Promise<WebLlmEngine> {
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

  const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm')
  const worker = new Worker(new URL('./webllm.worker.ts', import.meta.url), { type: 'module' })
  defaultWorker = worker
  const workerFailed = new Promise<never>((_, reject) => {
    worker.addEventListener(
      'error',
      () => reject(new Error('AI 실행 파일을 불러오지 못했습니다.')),
      { once: true },
    )
  })

  return Promise.race([
    CreateWebWorkerMLCEngine(worker, modelId, {
      initProgressCallback: ({ progress }) => {
        setDefaultModelProgress(Math.round(Math.max(0, Math.min(1, progress)) * 100))
      },
    }),
    workerFailed,
  ])
}

let defaultEnginePromise: Promise<WebLlmEngine> | undefined
let defaultWorker: Worker | undefined
let defaultModelStatus: WebLlmModelStatus = 'idle'
let defaultModelProgress = 0
let defaultModelError: string | undefined
const statusListeners = new Set<() => void>()

function setDefaultModelStatus(status: WebLlmModelStatus) {
  defaultModelStatus = status
  statusListeners.forEach((listener) => listener())
}

function setDefaultModelProgress(progress: number) {
  defaultModelProgress = progress
  statusListeners.forEach((listener) => listener())
}

function getModelErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  if (/fetch|network|download|ERR_FAILED|failed to load resource/i.test(message)) {
    return '모델 다운로드 연결에 실패했습니다. VPN이나 네트워크 설정을 확인하고 다시 시도해 주세요.'
  }
  if (/WebGPU|shader-f16|compatible GPU/i.test(message)) {
    return '이 브라우저나 기기에서 필요한 WebGPU 기능을 사용할 수 없습니다. 데스크톱 Chrome 또는 Edge에서 열어 주세요.'
  }
  if (/memory|allocation|device lost|GPU/i.test(message)) {
    return 'GPU에서 모델을 시작하지 못했습니다. 다른 탭을 닫고 다시 시도해 주세요.'
  }

  return 'AI를 시작하지 못했습니다. 페이지를 새로고침하고 다시 시도해 주세요.'
}

function loadDefaultEngine(modelId: string) {
  if (!defaultEnginePromise) {
    defaultModelError = undefined
    setDefaultModelProgress(0)
    setDefaultModelStatus('loading')
    defaultEnginePromise = loadWebLlmEngine(modelId).then(
      (engine) => {
        setDefaultModelProgress(100)
        setDefaultModelStatus('ready')
        return engine
      },
      (error: unknown) => {
        defaultWorker?.terminate()
        defaultWorker = undefined
        defaultEnginePromise = undefined
        defaultModelError = getModelErrorMessage(error)
        setDefaultModelStatus('error')
        throw error
      },
    )
  }

  return defaultEnginePromise
}

export function getWebLlmModelStatus() {
  return defaultModelStatus
}

export function getWebLlmModelProgress() {
  return defaultModelProgress
}

export function getWebLlmModelError() {
  return defaultModelError
}

export function subscribeWebLlmModelStatus(listener: () => void) {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

export async function prepareWebLlmModel() {
  await loadDefaultEngine(WEBLLM_MODEL_ID)
}

export function createWebLlmChatModelAdapter(loadEngine: LoadEngine): WebLlmChatModelAdapter {
  let enginePromise: Promise<WebLlmEngine> | undefined

  return {
    async *run(options) {
      enginePromise ??= loadEngine(WEBLLM_MODEL_ID).catch((error: unknown) => {
        enginePromise = undefined
        throw error
      })
      const engine = await enginePromise

      if (options.abortSignal.aborted) {
        throw new DOMException('중단된 요청입니다.', 'AbortError')
      }

      const interrupt = () => {
        engine.interruptGenerate()
      }
      options.abortSignal.addEventListener('abort', interrupt, { once: true })

      try {
        const chunks = await engine.chat.completions.create({
          messages: toWebLlmMessages(options),
          max_tokens: 512,
          stream: true,
        })
        let text = ''

        for await (const chunk of chunks) {
          text += chunk.choices[0]?.delta.content ?? ''
          if (text) {
            yield { content: [{ type: 'text', text }] }
          }
        }
      } finally {
        options.abortSignal.removeEventListener('abort', interrupt)
      }
    },
  }
}

export const webLlmChatModelAdapter = createWebLlmChatModelAdapter(loadDefaultEngine)
