import { describe, expect, it, vi } from 'vitest'
import type { ChatModelRunOptions, ChatModelRunResult, ThreadMessage } from '@assistant-ui/react'
import {
  createWebLlmChatModelAdapter,
  WEBLLM_MODEL_ID,
  type WebLlmEngine,
} from './webllm-chat-adapter'

function createMessage(role: 'user' | 'assistant', text: string): ThreadMessage {
  const common = {
    id: `${role}-${text}`,
    createdAt: new Date(),
    content: [{ type: 'text' as const, text }],
    metadata: { custom: {} },
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
  it('Qwen 모델을 한 번만 불러오고 전체 대화를 누적 스트리밍한다', async () => {
    const { create, engine } = createEngine(['반갑', '습니다'])
    const loadEngine = vi.fn(async (modelId: string) => {
      expect(modelId).toBe(WEBLLM_MODEL_ID)
      return engine
    })
    const adapter = createWebLlmChatModelAdapter(loadEngine)
    const options = createRunOptions([
      createMessage('user', '안녕'),
      createMessage('assistant', '안녕하세요'),
      createMessage('user', '질문'),
    ])

    const firstTexts = []
    for await (const result of adapter.run(options)) {
      firstTexts.push(getText(result))
    }
    for await (const _result of adapter.run(options)) {
      // 두 번째 실행에서도 같은 엔진을 재사용하는지만 확인한다.
    }

    expect(firstTexts).toEqual(['반갑', '반갑습니다'])
    expect(loadEngine).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({
      messages: [
        { role: 'system', content: '현재 PDF 5페이지를 읽고 있습니다.' },
        { role: 'user', content: '안녕' },
        { role: 'assistant', content: '안녕하세요' },
        { role: 'user', content: '질문' },
      ],
      max_tokens: 512,
      stream: true,
    })
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
      .fn<(modelId: string) => Promise<WebLlmEngine>>()
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
})
