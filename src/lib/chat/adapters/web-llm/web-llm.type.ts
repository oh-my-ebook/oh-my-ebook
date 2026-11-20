import type { ChatCompletionRequestStreaming } from '@mlc-ai/web-llm'

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

export interface WebLlmModelState {
  status: WebLlmModelStatus
  progress: number
  phase: WebLlmModelPhase
  progressDetail?: string
  error?: string
}
