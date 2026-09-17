import type {
  ChatModelRunOptions,
  ChatModelRunResult,
  ModelContext,
  TextMessagePart,
  ThreadMessage,
} from '@assistant-ui/react'

export type MockResponder = (
  question: string,
  context: ModelContext,
  abortSignal: AbortSignal,
) => AsyncGenerator<string, void>

function isTextPart(part: { type: string }): part is TextMessagePart {
  return part.type === 'text'
}

function extractLatestUserText(messages: readonly ThreadMessage[]) {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')
  if (!lastUserMessage) {
    return ''
  }
  return lastUserMessage.content
    .filter(isTextPart)
    .map((part) => part.text)
    .join('')
}

export function createMockChatModelAdapter(respond: MockResponder) {
  return {
    async *run({ abortSignal, context, messages }: ChatModelRunOptions) {
      const question = extractLatestUserText(messages)
      let accumulated = ''
      for await (const chunk of respond(question, context, abortSignal)) {
        accumulated += chunk
        yield { content: [{ type: 'text', text: accumulated }] } satisfies ChatModelRunResult
      }
    },
  }
}

const MOCK_RESPONSE_CHUNKS = [
  '질문을 확인했어요.',
  ' 지금은 Mock 응답이라',
  ' 실제 AI 답변은 아직 연결되지 않았어요.',
]
const MOCK_CHUNK_DELAY_MS = 400

function delay(ms: number, abortSignal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (abortSignal.aborted) {
      reject(new DOMException('중단된 요청입니다.', 'AbortError'))
      return
    }
    const timeoutId = setTimeout(resolve, ms)
    abortSignal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeoutId)
        reject(new DOMException('중단된 요청입니다.', 'AbortError'))
      },
      { once: true },
    )
  })
}

async function* defaultRespond(
  _question: string,
  _context: ModelContext,
  abortSignal: AbortSignal,
): AsyncGenerator<string, void> {
  for (const chunk of MOCK_RESPONSE_CHUNKS) {
    await delay(MOCK_CHUNK_DELAY_MS, abortSignal)
    yield chunk
  }
}

export const mockChatModelAdapter = createMockChatModelAdapter(defaultRespond)
