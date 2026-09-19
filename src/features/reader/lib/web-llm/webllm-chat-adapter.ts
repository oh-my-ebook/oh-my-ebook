import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  TextMessagePart,
  ThreadMessage,
} from '@assistant-ui/react'
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm'
import { getReadyEngine, invalidateDefaultEngine, type WebLlmEngine } from './webllm-model'

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
  if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
    console.debug('[ReaderChat] getContext', context.system ?? '')
  }

  const history = messages.map((message): ChatCompletionMessageParam => ({
    role: message.role,
    content: getText(message),
  }))
  return context.system
    ? [{ role: 'system' as const, content: context.system }, ...history]
    : history
}

// 엔진을 불러오고 캐싱하는 책임은 loadEngine(프로덕션에서는 getReadyEngine이 돌려주는 싱글턴)에 온전히 맡긴다.
// 어댑터가 자체 캐시를 두면 두 캐시의 생명주기(특히 실패 시 초기화)를 따로 맞춰야 해서 어긋나기 쉽다.
export function createWebLlmChatModelAdapter(
  loadEngine: () => Promise<WebLlmEngine>,
  onEngineFailure?: (error: unknown) => void,
) {
  return {
    async *run(options) {
      const engine = await loadEngine()

      if (options.abortSignal.aborted) {
        throw new DOMException('중단된 요청입니다.', 'AbortError')
      }

      const interrupt = () => engine.interruptGenerate()
      options.abortSignal.addEventListener('abort', interrupt, { once: true })

      try {
        const chunks = await engine.chat.completions.create({
          messages: toWebLlmMessages(options),
          // WebLLM은 Qwen 권장 설정의 top_k(20)를 지원하지 않아, 온도를 낮춰 확률이 낮은 토큰을 줄인다.
          temperature: 0.3,
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
      } catch (error) {
        // 생성 도중 엔진이 죽으면(워커 크래시, GPU device lost 등) 캐시에 고장난 엔진이 남아
        // 이후 모든 요청이 영구히 실패하므로, 캐시를 비우도록 알린다.
        onEngineFailure?.(error)
        throw error
      } finally {
        options.abortSignal.removeEventListener('abort', interrupt)
      }
    },
  } satisfies ChatModelAdapter
}

export const webLlmChatModelAdapter = createWebLlmChatModelAdapter(
  getReadyEngine,
  invalidateDefaultEngine,
)
