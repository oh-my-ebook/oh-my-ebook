import type { ChatModel } from '@shared/lib/chat/chat-model'
import type { WebLlmProvider } from './web-llm.provider'

export function createWebLlmChatModel(provider: WebLlmProvider): ChatModel {
  return {
    async *streamResponse({ messages, maxOutputTokens, signal }) {
      signal.throwIfAborted()
      const engine = await provider.getReadyEngine()
      signal.throwIfAborted()

      const interrupt = () => engine.interruptGenerate()
      signal.addEventListener('abort', interrupt, { once: true })

      try {
        const stream = await engine.chat.completions.create({
          messages: [...messages],
          // WebLLM은 Qwen 권장 설정의 top_k(20)를 지원하지 않아 온도를 낮춘다.
          temperature: 0.3,
          max_tokens: maxOutputTokens,
          stream: true,
        })

        for await (const chunk of stream) {
          yield chunk.choices[0]?.delta.content ?? ''
        }
      } catch (error) {
        // 생성 중 Worker나 GPU가 실패하면 재시도할 수 있도록 엔진을 비운다.
        provider.invalidateEngine(error)
        throw error
      } finally {
        signal.removeEventListener('abort', interrupt)
      }
    },
  }
}
