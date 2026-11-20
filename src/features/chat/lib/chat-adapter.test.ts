import { describe, expect, it, vi } from 'vitest'
import type { ChatModelRunOptions, ChatModelRunResult, ThreadMessage } from '@assistant-ui/react'
import type { ChatModel } from '@shared/lib/chat/chat-model'
import { encodeQuoteTexts } from '@/lib/quote'
import { createChatModelAdapter } from './chat-adapter'
import { estimateTextTokens } from './rag/format-search-context'

function createMessage(role: 'user' | 'assistant', text: string, quote?: string): ThreadMessage {
  const common = {
    id: `${role}-${text}`,
    createdAt: new Date(),
    content: [{ type: 'text' as const, text }],
    metadata: {
      custom: quote ? { quote: { messageId: 'pdf-page-3', text: quote } } : {},
    },
  }

  if (role === 'user') {
    return { ...common, role, attachments: [] }
  }

  return {
    ...common,
    role,
    status: { type: 'complete', reason: 'stop' },
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom: {},
    },
  }
}

function createRunOptions(
  messages: readonly ThreadMessage[],
  abortSignal: AbortSignal = new AbortController().signal,
): ChatModelRunOptions {
  return {
    messages,
    runConfig: {},
    abortSignal,
    context: { system: '현재 PDF 5페이지를 읽고 있습니다.' },
    unstable_getMessage: () => {
      throw new Error('테스트에서 사용하지 않음')
    },
  }
}

function getText(result: ChatModelRunResult) {
  const textPart = result.content?.find((part) => part.type === 'text')
  return textPart?.type === 'text' ? textPart.text : undefined
}

function createChatModel(chunks: string[]) {
  const streamResponse = vi.fn<ChatModel['streamResponse']>(async function* () {
    yield* chunks
  })
  return { streamResponse }
}

describe('createChatModelAdapter', () => {
  it('전체 대화를 누적 스트리밍하고, 시스템 컨텍스트와 대화 이력을 모델에 전달한다', async () => {
    const model = createChatModel(['반갑', '습니다'])
    const adapter = createChatModelAdapter(model)
    const options = createRunOptions([
      createMessage('user', '안녕'),
      createMessage('assistant', '안녕하세요'),
      createMessage('user', '질문'),
    ])

    const texts = []
    for await (const result of adapter.run(options)) {
      texts.push(getText(result))
    }

    expect(texts).toEqual(['반갑', '반갑습니다'])
    expect(model.streamResponse).toHaveBeenCalledWith({
      messages: [
        { role: 'system', content: '현재 PDF 5페이지를 읽고 있습니다.' },
        { role: 'user', content: '안녕' },
        { role: 'assistant', content: '안녕하세요' },
        { role: 'user', content: '질문' },
      ],
      maxOutputTokens: 512,
      signal: options.abortSignal,
    })
  })

  it('최신 질문의 검색 발췌를 프롬프트에 넣고 인용 출처는 답변 완료 후 추가한다', async () => {
    const model = createChatModel(['답', '변'])
    const retrieveChunks = vi.fn(async () => [
      {
        id: 'chunk-1',
        ordinal: 0,
        text: '검색된 책 본문',
        tokenCount: 3,
        score: 1.2,
        sources: [{ pageNumber: 7, startLineIndex: 0, endLineIndex: 1 }],
      },
    ])
    const adapter = createChatModelAdapter(model, retrieveChunks)
    const options = createRunOptions([createMessage('user', '검색 질문')])

    const results = []
    for await (const result of adapter.run(options)) {
      results.push(result)
    }

    expect(retrieveChunks).toHaveBeenCalledWith(options.messages, options.abortSignal)
    expect(model.streamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'system',
            content: expect.stringContaining(
              'If the excerpts do not support an answer, say that you do not know.\n\n' +
                '[문서 발췌 | p.7]\n검색된 책 본문',
            ),
          },
          { role: 'user', content: '검색 질문' },
        ],
      }),
    )
    expect(
      results.slice(0, -1).every((result) => !result.content?.some((part) => part.type === 'data')),
    ).toBe(true)
    expect(results.at(-1)?.status).toEqual({ type: 'complete', reason: 'stop' })
    expect(results.at(-1)?.content).toContainEqual({
      type: 'data',
      name: 'book-citations',
      data: {
        chunks: [
          expect.objectContaining({
            id: 'chunk-1',
            sources: [{ pageNumber: 7, startLineIndex: 0, endLineIndex: 1 }],
          }),
        ],
      },
    })
  })

  it('상위 5개 청크만 포함하고 응답 예산까지 합쳐 8,000토큰을 넘지 않는다', async () => {
    const model = createChatModel(['답변'])
    const retrieveChunks = vi.fn(async () =>
      Array.from({ length: 6 }, (_, index) => ({
        id: `chunk-${index}`,
        ordinal: index,
        text: `${index}번 청크 ${'한국어 본문 '.repeat(2_000)}`,
        tokenCount: 4_000,
        score: 10 - index,
        sources: [{ pageNumber: index + 1, startLineIndex: 0, endLineIndex: 1 }],
      })),
    )
    const adapter = createChatModelAdapter(model, retrieveChunks)

    for await (const _result of adapter.run(
      createRunOptions([createMessage('user', '전체 예산을 확인해 줘')]),
    )) {
      // 모델에 전달된 최종 요청을 검증한다.
    }

    const request = model.streamResponse.mock.calls[0]?.[0]
    if (!request) throw new Error('모델 요청이 생성되지 않았습니다.')
    const system = request.messages[0]?.content
    expect(system).toContain('[문서 발췌 | p.1]')
    expect(system).not.toContain('[문서 발췌 | p.6]')
    const promptTokens = request.messages.reduce(
      (total, { content }) => total + 8 + estimateTextTokens(content),
      0,
    )
    expect(promptTokens + request.maxOutputTokens).toBeLessThanOrEqual(8_000)
  })

  it('책 검색에 실패하면 모델을 호출하지 않는다', async () => {
    const model = createChatModel(['답변'])
    const retrieveChunks = vi.fn(async () => {
      throw new Error('검색 실패')
    })
    const adapter = createChatModelAdapter(model, retrieveChunks)

    await expect(
      (async () => {
        for await (const _result of adapter.run(
          createRunOptions([createMessage('user', '검색 질문')]),
        )) {
          // retrieval 단계에서 실패해야 한다.
        }
      })(),
    ).rejects.toThrow('검색 실패')

    expect(model.streamResponse).not.toHaveBeenCalled()
  })

  it('책 검색을 기다리는 동안 취소하면 모델에 생성 요청을 보내지 않는다', async () => {
    const abortController = new AbortController()
    const model = createChatModel(['답변'])
    const retrieveChunks = async () => {
      abortController.abort()
      return []
    }
    const adapter = createChatModelAdapter(model, retrieveChunks)
    const options = createRunOptions([createMessage('user', '검색 질문')], abortController.signal)

    await expect(adapter.run(options).next()).rejects.toMatchObject({ name: 'AbortError' })
    expect(model.streamResponse).not.toHaveBeenCalled()
  })

  it('사용자 메시지의 PDF 인용문을 질문과 함께 모델에 전달한다', async () => {
    const model = createChatModel(['답변'])
    const adapter = createChatModelAdapter(model)
    const options = createRunOptions([createMessage('user', '이 부분을 설명해 주세요.', '인용문')])

    for await (const _result of adapter.run(options)) {
      // 모델에 전달된 메시지만 검증한다.
    }

    expect(model.streamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: '현재 PDF 5페이지를 읽고 있습니다.' },
          {
            role: 'user',
            content: '<selected_quote>\n인용문\n</selected_quote>\n\n이 부분을 설명해 주세요.',
          },
        ],
      }),
    )
  })

  it('여러 PDF 인용문을 각각 구분해 모델에 전달한다', async () => {
    const model = createChatModel(['답변'])
    const adapter = createChatModelAdapter(model)
    const options = createRunOptions([
      createMessage(
        'user',
        '공통점을 설명해 주세요.',
        encodeQuoteTexts(['첫 번째 인용문', '두 번째 인용문']),
      ),
    ])

    for await (const _result of adapter.run(options)) {
      // 모델에 전달된 메시지만 검증한다.
    }

    expect(model.streamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: '현재 PDF 5페이지를 읽고 있습니다.' },
          {
            role: 'user',
            content:
              '<selected_quote>\n첫 번째 인용문\n</selected_quote>\n\n' +
              '<selected_quote>\n두 번째 인용문\n</selected_quote>\n\n' +
              '공통점을 설명해 주세요.',
          },
        ],
      }),
    )
  })

  it('자세히 설명 질문은 선택 문장용 상세 지시문으로 바꿔 엔진에 전달한다', async () => {
    const model = createChatModel(['설명'])
    const adapter = createChatModelAdapter(model)
    const options = createRunOptions([
      createMessage(
        'user',
        '선택한 문장을 현재 페이지와 책의 맥락에 맞춰 자세히 설명해 주세요.',
        '선택한 문장',
      ),
    ])

    for await (const _result of adapter.run(options)) {
      // 모델에 전달된 메시지만 검증한다.
    }

    expect(model.streamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: '현재 PDF 5페이지를 읽고 있습니다.' },
          {
            role: 'user',
            content: [
              '<selected_quote>',
              '선택한 문장',
              '</selected_quote>',
              '',
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
            ].join('\n'),
          },
        ],
      }),
    )
  })

  it('페이지 요약 질문은 상세 지시문으로 바꿔 엔진에 전달한다', async () => {
    const model = createChatModel(['요약'])
    const adapter = createChatModelAdapter(model)
    const options = createRunOptions([createMessage('user', '이 페이지에 대해 요약해줘')])

    for await (const _result of adapter.run(options)) {
      // 모델에 전달된 메시지만 검증한다.
    }

    expect(model.streamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: '현재 PDF 5페이지를 읽고 있습니다.' },
          {
            role: 'user',
            content: [
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
            ].join('\n'),
          },
        ],
      }),
    )
  })
})
