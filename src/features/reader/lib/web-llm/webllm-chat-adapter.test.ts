import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatModelRunOptions, ChatModelRunResult, ThreadMessage } from '@assistant-ui/react'
import { stubSupportedGpu, stubWorker } from '../../../../test/web-llm-stubs'
import { encodeQuoteTexts } from '../../../../lib/quote'
import { createWebLlmChatModelAdapter } from './webllm-chat-adapter'
import type { WebLlmEngine } from './webllm-model'

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

function createEngine(chunks: string[]) {
  const create = vi.fn(async () => ({
    async *[Symbol.asyncIterator]() {
      for (const content of chunks) {
        yield { choices: [{ delta: { content } }] }
      }
    },
  }))
  const engine: WebLlmEngine = {
    chat: { completions: { create } },
    interruptGenerate: vi.fn(async () => undefined),
  }

  return { create, engine }
}

describe('createWebLlmChatModelAdapter', () => {
  it('전체 대화를 누적 스트리밍하고, 시스템 컨텍스트와 대화 이력을 엔진에 전달한다', async () => {
    const { create, engine } = createEngine(['반갑', '습니다'])
    const adapter = createWebLlmChatModelAdapter(async () => engine)
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
    expect(create).toHaveBeenCalledWith({
      messages: [
        { role: 'system', content: '현재 PDF 5페이지를 읽고 있습니다.' },
        { role: 'user', content: '안녕' },
        { role: 'assistant', content: '안녕하세요' },
        { role: 'user', content: '질문' },
      ],
      max_tokens: 512,
      stream: true,
      temperature: 0.3,
    })
  })

  it('사용자 메시지의 PDF 인용문을 질문과 함께 엔진에 전달한다', async () => {
    const { create, engine } = createEngine(['답변'])
    const adapter = createWebLlmChatModelAdapter(async () => engine)
    const options = createRunOptions([createMessage('user', '이 부분을 설명해 주세요.', '인용문')])

    for await (const _result of adapter.run(options)) {
      // 엔진에 전달된 메시지만 검증한다.
    }

    expect(create).toHaveBeenCalledWith(
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

  it('여러 PDF 인용문을 각각 구분해 엔진에 전달한다', async () => {
    const { create, engine } = createEngine(['답변'])
    const adapter = createWebLlmChatModelAdapter(async () => engine)
    const options = createRunOptions([
      createMessage(
        'user',
        '공통점을 설명해 주세요.',
        encodeQuoteTexts(['첫 번째 인용문', '두 번째 인용문']),
      ),
    ])

    for await (const _result of adapter.run(options)) {
      // 엔진에 전달된 메시지만 검증한다.
    }

    expect(create).toHaveBeenCalledWith(
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
    const { create, engine } = createEngine(['설명'])
    const adapter = createWebLlmChatModelAdapter(async () => engine)
    const options = createRunOptions([
      createMessage(
        'user',
        '선택한 문장을 현재 페이지와 책의 맥락에 맞춰 자세히 설명해 주세요.',
        '선택한 문장',
      ),
    ])

    for await (const _result of adapter.run(options)) {
      // 엔진에 전달된 메시지만 검증한다.
    }

    expect(create).toHaveBeenCalledWith(
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
    const { create, engine } = createEngine(['요약'])
    const adapter = createWebLlmChatModelAdapter(async () => engine)
    const options = createRunOptions([createMessage('user', '이 페이지에 대해 요약해줘')])

    for await (const _result of adapter.run(options)) {
      // 엔진에 전달된 메시지만 검증한다.
    }

    expect(create).toHaveBeenCalledWith(
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

  it('생성 중단을 WebLLM 엔진에 전달한다', async () => {
    const abortController = new AbortController()
    const { engine } = createEngine(['답변'])
    const adapter = createWebLlmChatModelAdapter(async () => engine)

    const results = adapter.run(
      createRunOptions([createMessage('user', '질문')], abortController.signal),
    )
    const firstResult = await results.next()
    if (firstResult.done) {
      throw new Error('첫 응답이 생성되지 않았습니다.')
    }
    abortController.abort()

    expect(getText(firstResult.value)).toBe('답변')
    expect(engine.interruptGenerate).toHaveBeenCalledOnce()
    await results.return()
  })

  it('모델 로딩 실패 후 재시도하면 엔진을 다시 불러온다', async () => {
    const { engine } = createEngine(['답변'])
    const loadEngine = vi
      .fn<() => Promise<WebLlmEngine>>()
      .mockRejectedValueOnce(new Error('모델 로딩 실패'))
      .mockResolvedValueOnce(engine)
    const adapter = createWebLlmChatModelAdapter(loadEngine)
    const options = createRunOptions([createMessage('user', '질문')])

    await expect(
      (async () => {
        for await (const _result of adapter.run(options)) {
          // 첫 실행은 모델 로딩 단계에서 실패해야 한다.
        }
      })(),
    ).rejects.toThrow('모델 로딩 실패')

    const texts = []
    for await (const result of adapter.run(options)) {
      texts.push(getText(result))
    }

    expect(texts).toEqual(['답변'])
    expect(loadEngine).toHaveBeenCalledTimes(2)
  })

  it('생성 중 실패하면 onEngineFailure를 호출하고, 이후 요청은 정상적으로 이어진다', async () => {
    const failingEngine: WebLlmEngine = {
      chat: {
        completions: {
          create: vi.fn(async () => {
            throw new Error('생성 실패')
          }),
        },
      },
      interruptGenerate: vi.fn(),
    }
    const { engine: workingEngine } = createEngine(['답변'])
    const loadEngine = vi
      .fn<() => Promise<WebLlmEngine>>()
      .mockResolvedValueOnce(failingEngine)
      .mockResolvedValueOnce(workingEngine)
    const onEngineFailure = vi.fn()
    const adapter = createWebLlmChatModelAdapter(loadEngine, onEngineFailure)
    const options = createRunOptions([createMessage('user', '질문')])

    await expect(
      (async () => {
        for await (const _result of adapter.run(options)) {
          // 첫 실행은 생성 단계에서 실패해야 한다.
        }
      })(),
    ).rejects.toThrow('생성 실패')

    expect(onEngineFailure).toHaveBeenCalledExactlyOnceWith(new Error('생성 실패'))

    const texts = []
    for await (const result of adapter.run(options)) {
      texts.push(getText(result))
    }

    expect(texts).toEqual(['답변'])
  })
})

// 프로덕션 어댑터가 모델 싱글턴과 제대로 연결됐는지 확인한다. 싱글턴이 모듈 범위에 있어 새 모듈을 불러온다.
describe('webLlmChatModelAdapter', () => {
  let restoreGpu: () => void

  beforeEach(() => {
    vi.resetModules()
    restoreGpu = stubSupportedGpu()
    stubWorker()
  })

  afterEach(() => {
    restoreGpu()
    vi.unstubAllGlobals()
    vi.doUnmock('@mlc-ai/web-llm')
  })

  it('모델을 다운로드하기 전에 질문하면 모델을 불러오지 않고 실패한다', async () => {
    const createWebWorkerMLCEngine = vi.fn()
    vi.doMock('@mlc-ai/web-llm', () => ({ CreateWebWorkerMLCEngine: createWebWorkerMLCEngine }))
    const { webLlmChatModelAdapter } = await import('./webllm-chat-adapter')
    const { useWebLlmModelStore } = await import('./webllm-model')
    const options = createRunOptions([createMessage('user', '질문')])

    await expect(
      (async () => {
        for await (const _result of webLlmChatModelAdapter.run(options)) {
          // 모델이 준비되지 않았으므로 응답 없이 실패해야 한다.
        }
      })(),
    ).rejects.toThrow('모델이 준비되지 않았습니다.')

    expect(createWebWorkerMLCEngine).not.toHaveBeenCalled()
    expect(useWebLlmModelStore.getState().status).toBe('idle')
  })

  it('모델 다운로드에 실패한 뒤 질문해도 다운로드를 다시 시작하지 않는다', async () => {
    const createWebWorkerMLCEngine = vi
      .fn()
      .mockRejectedValue(new Error('failed to fetch model shard'))
    vi.doMock('@mlc-ai/web-llm', () => ({ CreateWebWorkerMLCEngine: createWebWorkerMLCEngine }))
    const { webLlmChatModelAdapter } = await import('./webllm-chat-adapter')
    const { prepareWebLlmModel, useWebLlmModelStore } = await import('./webllm-model')
    const options = createRunOptions([createMessage('user', '질문')])
    await expect(prepareWebLlmModel()).rejects.toThrow()

    await expect(
      (async () => {
        for await (const _result of webLlmChatModelAdapter.run(options)) {
          // 모델이 준비되지 않았으므로 응답 없이 실패해야 한다.
        }
      })(),
    ).rejects.toThrow('모델이 준비되지 않았습니다.')

    expect(createWebWorkerMLCEngine).toHaveBeenCalledOnce()
    expect(useWebLlmModelStore.getState().status).toBe('error')
  })

  it('생성 중 엔진이 죽으면 상태가 초기화돼 재시도 시 모델을 다시 불러온다', async () => {
    const failingEngine: WebLlmEngine = {
      chat: {
        completions: {
          create: vi.fn(async () => {
            throw new Error('device lost during generation')
          }),
        },
      },
      interruptGenerate: vi.fn(),
    }
    const { engine: workingEngine } = createEngine(['답변'])
    const createWebWorkerMLCEngine = vi
      .fn()
      .mockResolvedValueOnce(failingEngine)
      .mockResolvedValueOnce(workingEngine)
    vi.doMock('@mlc-ai/web-llm', () => ({ CreateWebWorkerMLCEngine: createWebWorkerMLCEngine }))
    const { webLlmChatModelAdapter } = await import('./webllm-chat-adapter')
    const { prepareWebLlmModel, useWebLlmModelStore } = await import('./webllm-model')
    const options = createRunOptions([createMessage('user', '질문')])
    await prepareWebLlmModel()

    await expect(
      (async () => {
        for await (const _result of webLlmChatModelAdapter.run(options)) {
          // 생성 단계에서 실패해야 한다.
        }
      })(),
    ).rejects.toThrow('device lost during generation')

    expect(useWebLlmModelStore.getState().status).toBe('error')

    await prepareWebLlmModel()

    expect(useWebLlmModelStore.getState().status).toBe('ready')
    expect(createWebWorkerMLCEngine).toHaveBeenCalledTimes(2)
  })
})
