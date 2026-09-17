import { describe, expect, it, vi } from 'vitest'
import type { ChatModelRunOptions, ChatModelRunResult, ThreadMessage } from '@assistant-ui/react'
import { createPromiseController } from '../../../test/promise-controller'
import {
  createMockChatModelAdapter,
  mockChatModelAdapter,
  type MockResponder,
} from './mock-chat-adapter'

function createUserMessage(text: string): ThreadMessage {
  return {
    id: 'user-message',
    createdAt: new Date(),
    role: 'user',
    content: [{ type: 'text', text }],
    attachments: [],
    metadata: { custom: {} },
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
    context: {},
    unstable_getMessage: () => {
      throw new Error('테스트에서 사용하지 않음')
    },
  }
}

function getAccumulatedText(result: ChatModelRunResult) {
  const textPart = result.content?.find((part) => part.type === 'text')
  return textPart?.type === 'text' ? textPart.text : undefined
}

async function collectAccumulatedTexts(respond: MockResponder, question: string) {
  const adapter = createMockChatModelAdapter(respond)
  const texts: (string | undefined)[] = []
  for await (const result of adapter.run(createRunOptions([createUserMessage(question)]))) {
    texts.push(getAccumulatedText(result))
  }
  return texts
}

describe('createMockChatModelAdapter', () => {
  it('응답 조각을 누적해 매번 전체 텍스트를 내보낸다', async () => {
    async function* respond() {
      yield '안녕'
      yield '하세요'
    }

    const texts = await collectAccumulatedTexts(respond, '질문')

    expect(texts).toEqual(['안녕', '안녕하세요'])
  })

  it('응답 도중 실패하면 오류를 던진다', async () => {
    async function* respond(): ReturnType<MockResponder> {
      yield '진행 중'
      throw new Error('응답 생성 실패')
    }

    await expect(collectAccumulatedTexts(respond, '질문')).rejects.toThrow('응답 생성 실패')
  })

  it('재시도로 같은 질문을 다시 실행해도 독립적으로 스트리밍된다', async () => {
    const controller = createPromiseController<void>()
    let callCount = 0

    async function* respond(): ReturnType<MockResponder> {
      callCount += 1
      if (callCount === 1) {
        throw new Error('첫 시도 실패')
      }
      await controller.promise
      yield '재시도 성공'
    }

    const adapter = createMockChatModelAdapter(respond)
    const runOptions = createRunOptions([createUserMessage('같은 질문')])

    await expect(
      (async () => {
        for await (const _result of adapter.run(runOptions)) {
          // 첫 시도는 실패해야 한다.
        }
      })(),
    ).rejects.toThrow('첫 시도 실패')

    const retryTexts: (string | undefined)[] = []
    const retryRun = adapter.run(runOptions)
    controller.resolve()
    for await (const result of retryRun) {
      retryTexts.push(getAccumulatedText(result))
    }

    expect(retryTexts).toEqual(['재시도 성공'])
  })

  it('run()이 respond에 abortSignal을 그대로 전달한다', async () => {
    const abortController = new AbortController()
    let receivedSignal: AbortSignal | undefined

    async function* respond(
      _question: string,
      _context: unknown,
      abortSignal: AbortSignal,
    ): ReturnType<MockResponder> {
      receivedSignal = abortSignal
      yield '응답'
    }

    const adapter = createMockChatModelAdapter(respond as MockResponder)
    const runOptions = createRunOptions([createUserMessage('질문')], abortController.signal)
    for await (const _result of adapter.run(runOptions)) {
      // 어댑터가 전달한 abortSignal을 확인하는 것이 목적이라 결과 자체는 쓰지 않는다.
    }

    expect(receivedSignal).toBe(abortController.signal)
  })

  it('mockChatModelAdapter는 중단 시 지연 타이머를 정리해 이후 조각을 만들지 않는다', async () => {
    vi.useFakeTimers()
    try {
      const abortController = new AbortController()
      const runOptions = createRunOptions([createUserMessage('질문')], abortController.signal)
      const texts: (string | undefined)[] = []

      const runPromise = (async () => {
        try {
          for await (const result of mockChatModelAdapter.run(runOptions)) {
            texts.push(getAccumulatedText(result))
          }
        } catch {
          // 중단 시 예외가 발생하는 것은 의도한 동작이다.
        }
      })()

      await vi.advanceTimersByTimeAsync(400)
      abortController.abort()
      // 남은 지연 시간을 다 흘려보내도 정리된 타이머는 다시 발화하지 않아야 한다.
      await vi.advanceTimersByTimeAsync(10_000)
      await runPromise

      expect(texts).toEqual(['질문을 확인했어요.'])
    } finally {
      vi.useRealTimers()
    }
  })
})
