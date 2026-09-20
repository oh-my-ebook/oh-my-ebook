import type { TextMessagePart, ThreadMessage } from '@assistant-ui/react'
import { decodeQuoteTexts } from '@/lib/quote'

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

function isTextPart(part: { type: string }): part is TextMessagePart {
  return part.type === 'text'
}

export function getContextText(message: Pick<ThreadMessage, 'role' | 'content' | 'metadata'>) {
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

export const CONTEXT_WINDOW = 8192
export const RESPONSE_TOKENS = 512
export const SAFETY_TOKENS = 128
export const AUTO_COMPACT_RATIO = 0.9

export type TokenCounter = (text: string) => number

export interface ContextMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export function toContextMessages(messages: readonly ThreadMessage[]): ContextMessage[] {
  return messages.map((message) => ({ role: message.role, content: getContextText(message) }))
}

// Qwen2의 ChatML 템플릿. WebLLM과 같이 각 메시지를 따로 인코딩한다.
function messageTokens(message: ContextMessage, count: TokenCounter) {
  return count(`<|im_start|>${message.role}\n${message.content}<|im_end|>\n`)
}

export function prepareContext(
  system: string,
  history: readonly ContextMessage[],
  count: TokenCounter,
) {
  let systemText = system || 'You are a helpful assistant.'
  const tokenCounts = history.map((message) => messageTokens(message, count))
  let conversationTokens = tokenCounts.reduce((sum, tokens) => sum + tokens, 0)
  const headerTokens = count('<|im_start|>assistant\n')
  const initialSystemTokens = messageTokens({ role: 'system', content: systemText }, count)
  const reserved = RESPONSE_TOKENS + SAFETY_TOKENS
  let start = 0

  // 질문·답변을 함께 제외한다. 긴 대화도 각 메시지는 한 번만 인코딩한다.
  for (const [index, message] of history.entries()) {
    if (
      initialSystemTokens + conversationTokens + headerTokens + reserved <
      CONTEXT_WINDOW * AUTO_COMPACT_RATIO
    )
      break
    if (index === 0 || message.role !== 'user') continue
    while (start < index) {
      conversationTokens -= tokenCounts[start] ?? 0
      start += 1
    }
  }
  const retained = history.slice(start)
  const inputTokens = () =>
    messageTokens({ role: 'system', content: systemText }, count) +
    conversationTokens +
    headerTokens

  const truncatedSources: string[] = []
  for (const [tag, label] of [
    ['page_context', '페이지 본문'],
    ['book_metadata', '책 정보'],
  ]) {
    if (inputTokens() + reserved <= CONTEXT_WINDOW) break
    const pattern = new RegExp(`(<${tag}>)([\\s\\S]*?)(</${tag}>)`)
    const match = pattern.exec(systemText)
    if (!match) continue
    const original = systemText
    const chars = Array.from(match[2] ?? '')
    const replacement = (length: number) =>
      original.replace(
        pattern,
        () =>
          `${match[1]}${chars.slice(0, length).join('')}\n[일부 내용은 컨텍스트 한도로 생략됨]\n${match[3]}`,
      )
    let low = 0
    let high = chars.length
    systemText = replacement(0)
    while (low < high) {
      const mid = Math.ceil((low + high) / 2)
      systemText = replacement(mid)
      if (inputTokens() + reserved <= CONTEXT_WINDOW) low = mid
      else high = mid - 1
    }
    systemText = replacement(low)
    truncatedSources.push(label ?? '')
  }

  const input = inputTokens()
  const pageTokens = count(systemText.match(/<page_context>([\s\S]*?)<\/page_context>/)?.[1] ?? '')
  const metadataTokens = count(
    systemText.match(/<book_metadata>([\s\S]*?)<\/book_metadata>/)?.[1] ?? '',
  )
  return {
    messages: [{ role: 'system' as const, content: systemText }, ...retained],
    inputTokens: input,
    totalTokens: input + reserved,
    pageTokens,
    metadataTokens,
    conversationTokens,
    systemTokens: Math.max(0, input - pageTokens - metadataTokens - conversationTokens),
    removedMessages: history.length - retained.length,
    truncatedSources,
    error:
      input + reserved > CONTEXT_WINDOW
        ? '컨텍스트 한도를 넘었습니다. 질문을 줄이거나 인용문을 삭제한 뒤 다시 보내 주세요.'
        : undefined,
  }
}

export function filterContextMessages(
  messages: readonly ThreadMessage[],
  excludedIds: ReadonlySet<string>,
) {
  const latestQuestion = messages.findLastIndex((message) => message.role === 'user')
  return messages.filter(
    (message, index) => index >= latestQuestion || !excludedIds.has(message.id),
  )
}
