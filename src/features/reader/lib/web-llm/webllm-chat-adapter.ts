import type { ChatModelAdapter } from '@assistant-ui/react'
import { prepareContext, RESPONSE_TOKENS, toContextMessages } from './webllm-context'
import { loadWebLlmTokenCounter } from './webllm-tokenizer'
import { getReadyEngine, invalidateDefaultEngine, type WebLlmEngine } from './webllm-model'

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

      const count = await loadWebLlmTokenCounter()
      options.abortSignal.throwIfAborted()
      const budget = prepareContext(
        options.context.system ?? '',
        toContextMessages(options.messages),
        count,
      )
      if (budget.error) throw new Error(budget.error)

      const interrupt = () => engine.interruptGenerate()
      options.abortSignal.addEventListener('abort', interrupt, { once: true })

      try {
        const chunks = await engine.chat.completions.create({
          messages: budget.messages,
          // WebLLM은 Qwen 권장 설정의 top_k(20)를 지원하지 않아, 온도를 낮춰 확률이 낮은 토큰을 줄인다.
          temperature: 0.3,
          max_tokens: RESPONSE_TOKENS,
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
        if (options.abortSignal.aborted) throw error
        if (String(error).startsWith('ContextWindowSizeExceededError:')) {
          throw new Error(
            '컨텍스트 한도를 넘었습니다. 이전 대화를 정리하거나 질문과 인용문을 줄여 주세요.',
          )
        }
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
