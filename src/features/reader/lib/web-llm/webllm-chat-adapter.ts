import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  TextMessagePart,
  ThreadMessage,
} from '@assistant-ui/react'
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm'
import type { SearchChunkResult } from '@/features/ebook-list/ebook-types'
import { decodeQuoteTexts } from '@/lib/quote'
import { BOOK_CITATIONS_DATA_NAME } from '../rag/book-citations'
import {
  estimateTextTokens,
  formatSearchContextWithChunks,
  truncateToTokenBudget,
} from '../rag/format-search-context'
import { searchBookChunks, type SearchChunks } from '../rag/search-book-chunks'
import { getReadyEngine, invalidateDefaultEngine, type WebLlmEngine } from './webllm-model'

const PAGE_SUMMARY_QUESTION = '이 페이지에 대해 요약해줘'
const EXPLAIN_SELECTION_QUESTION =
  '선택한 문장을 현재 페이지와 책의 맥락에 맞춰 자세히 설명해 주세요.'

const EXPLAIN_SELECTION_PROMPT = [
  'Explain the selected quote using the provided book metadata and current page context.',
  '',
  'Instructions:',
  '- You MUST answer in Korean.',
  '- Begin with a concise paraphrase of the quote in plain language.',
  '- Clarify the key terms, references, and reasoning needed to understand it.',
  '- Connect it to the surrounding page and book only when the provided context supports the connection.',
  '- If the context is insufficient or ambiguous, state exactly what cannot be determined.',
  '- Do not infer or add information that is not present in the provided context.',
  '- Avoid repeating the quote verbatim unless needed for the explanation.',
].join('\n')

const PAGE_SUMMARY_PROMPT = [
  'Write a three-sentence summary of the content above, then organize the key concepts.',
  '',
  'Summarize the entire content in exactly three natural prose sentences.',
  'Organize the key concepts as bullet points.',
  '',
  'Instructions:',
  '- You MUST answer in Korean.',
  '- Write the summary as exactly three prose sentences, not as bullet points.',
  '- Include only the key concepts found on the page, up to five.',
  '- Write an introduction and a conclusion.',
  '- Do not infer or add information that is not present on the page.',
].join('\n')

const RETRIEVAL_PROMPT = [
  'Answer only from the supplied document excerpts.',
  'If the excerpts do not support an answer, say that you do not know.',
].join('\n')

export const MAX_MODEL_CONTEXT_TOKENS = 8_000
export const MAX_COMPLETION_TOKENS = 512
const MAX_PROMPT_TOKENS = MAX_MODEL_CONTEXT_TOKENS - MAX_COMPLETION_TOKENS
const MESSAGE_OVERHEAD_TOKENS = 8

function isTextPart(part: { type: string }): part is TextMessagePart {
  return part.type === 'text'
}

function getText(message: ThreadMessage) {
  const visibleText = message.content
    .filter(isTextPart)
    .map((part) => part.text)
    .join('')
  const text =
    message.role !== 'user'
      ? visibleText
      : visibleText === PAGE_SUMMARY_QUESTION
        ? PAGE_SUMMARY_PROMPT
        : visibleText === EXPLAIN_SELECTION_QUESTION
          ? EXPLAIN_SELECTION_PROMPT
          : visibleText
  const quote = message.metadata.custom?.quote
  if (
    typeof quote !== 'object' ||
    quote === null ||
    !('text' in quote) ||
    typeof quote.text !== 'string'
  ) {
    return text
  }

  const quoteContext = decodeQuoteTexts(quote.text)
    .map((quoteText) => `<selected_quote>\n${quoteText}\n</selected_quote>`)
    .join('\n\n')
  return `${quoteContext}\n\n${text}`
}

function getMessageContent(message: ChatCompletionMessageParam): string {
  return typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
}

function estimateWebLlmMessageTokens(message: ChatCompletionMessageParam): number {
  return MESSAGE_OVERHEAD_TOKENS + estimateTextTokens(getMessageContent(message))
}

export function estimateWebLlmMessagesTokens(
  messages: readonly ChatCompletionMessageParam[],
): number {
  return messages.reduce((total, message) => total + estimateWebLlmMessageTokens(message), 0)
}

function truncateMessage(
  message: ChatCompletionMessageParam,
  tokenBudget: number,
): ChatCompletionMessageParam | null {
  const contentBudget = tokenBudget - MESSAGE_OVERHEAD_TOKENS
  if (contentBudget <= 0) return null
  return { ...message, content: truncateToTokenBudget(getMessageContent(message), contentBudget) }
}

function fitMessagesToPromptBudget(
  system: string | undefined,
  history: ChatCompletionMessageParam[],
): ChatCompletionMessageParam[] {
  const latestMessage = history.at(-1)
  const latestReservation = latestMessage
    ? Math.min(estimateWebLlmMessageTokens(latestMessage), Math.floor(MAX_PROMPT_TOKENS / 2))
    : 0
  const systemMessage = system
    ? truncateMessage({ role: 'system', content: system }, MAX_PROMPT_TOKENS - latestReservation)
    : null
  const selectedHistory: ChatCompletionMessageParam[] = []
  let remainingTokens =
    MAX_PROMPT_TOKENS - (systemMessage ? estimateWebLlmMessageTokens(systemMessage) : 0)

  for (const message of history.toReversed()) {
    const messageTokens = estimateWebLlmMessageTokens(message)
    if (messageTokens <= remainingTokens) {
      selectedHistory.unshift(message)
      remainingTokens -= messageTokens
      continue
    }
    if (selectedHistory.length === 0) {
      const truncatedMessage = truncateMessage(message, remainingTokens)
      if (truncatedMessage) selectedHistory.unshift(truncatedMessage)
    }
    break
  }

  return systemMessage ? [systemMessage, ...selectedHistory] : selectedHistory
}

function toWebLlmMessages(
  { context, messages }: ChatModelRunOptions,
  chunks?: SearchChunkResult[],
): { citationChunks: readonly SearchChunkResult[]; messages: ChatCompletionMessageParam[] } {
  if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
    console.debug('[ReaderChat] getContext', context.system ?? '')
  }

  const history = messages.map((message): ChatCompletionMessageParam => ({
    role: message.role,
    content: getText(message),
  }))
  if (chunks === undefined) {
    return { citationChunks: [], messages: fitMessagesToPromptBudget(context.system, history) }
  }

  const fixedSystem = [context.system, RETRIEVAL_PROMPT].filter(Boolean).join('\n\n')
  const latestMessage = history.at(-1)
  const excerptBudget = Math.max(
    0,
    MAX_PROMPT_TOKENS -
      estimateWebLlmMessageTokens({ role: 'system', content: fixedSystem }) -
      (latestMessage ? estimateWebLlmMessageTokens(latestMessage) : 0),
  )
  const formattedContext = formatSearchContextWithChunks(chunks, excerptBudget)
  const retrievalSystem = [fixedSystem, formattedContext.context].filter(Boolean).join('\n\n')
  return {
    citationChunks: formattedContext.chunks,
    messages: fitMessagesToPromptBudget(retrievalSystem, history),
  }
}

type RetrieveChunks = (
  messages: readonly ThreadMessage[],
  signal: AbortSignal,
) => Promise<SearchChunkResult[]>

// 엔진을 불러오고 캐싱하는 책임은 loadEngine(프로덕션에서는 getReadyEngine이 돌려주는 싱글턴)에 온전히 맡긴다.
// 어댑터가 자체 캐시를 두면 두 캐시의 생명주기(특히 실패 시 초기화)를 따로 맞춰야 해서 어긋나기 쉽다.
export function createWebLlmChatModelAdapter(
  loadEngine: () => Promise<WebLlmEngine>,
  onEngineFailure?: (error: unknown) => void,
  retrieveChunks?: RetrieveChunks,
) {
  return {
    async *run(options) {
      if (options.abortSignal.aborted) {
        throw new DOMException('중단된 요청입니다.', 'AbortError')
      }

      const retrievedChunks = retrieveChunks
        ? await retrieveChunks(options.messages, options.abortSignal)
        : undefined
      const engine = await loadEngine()

      const interrupt = () => engine.interruptGenerate()
      options.abortSignal.addEventListener('abort', interrupt, { once: true })

      try {
        const requestContext = toWebLlmMessages(options, retrievedChunks)
        const stream = await engine.chat.completions.create({
          messages: requestContext.messages,
          // WebLLM은 Qwen 권장 설정의 top_k(20)를 지원하지 않아, 온도를 낮춰 확률이 낮은 토큰을 줄인다.
          temperature: 0.3,
          max_tokens: MAX_COMPLETION_TOKENS,
          stream: true,
        })
        let text = ''

        for await (const chunk of stream) {
          text += chunk.choices[0]?.delta.content ?? ''
          if (text) {
            yield { content: [{ type: 'text', text }] }
          }
        }
        if (text && requestContext.citationChunks.length > 0) {
          yield {
            content: [
              { type: 'text', text },
              {
                type: 'data',
                name: BOOK_CITATIONS_DATA_NAME,
                data: { chunks: requestContext.citationChunks },
              },
            ],
            status: { type: 'complete', reason: 'stop' },
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

export function createBookSearchWebLlmChatModelAdapter(bookId: string, searchChunks: SearchChunks) {
  return createWebLlmChatModelAdapter(getReadyEngine, invalidateDefaultEngine, (messages, signal) =>
    searchBookChunks({ bookId, messages, searchChunks, signal }),
  )
}

export const webLlmChatModelAdapter = createWebLlmChatModelAdapter(
  getReadyEngine,
  invalidateDefaultEngine,
)
