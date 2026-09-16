import { describe, expect, it } from 'vitest'
import type { ChatModelRunOptions, ChatModelRunResult, ThreadMessage } from '@assistant-ui/react'
import { createPromiseController } from '../../../test/promise-controller'
import { createMockChatModelAdapter, type MockResponder } from './mock-chat-adapter'

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

function createRunOptions(messages: readonly ThreadMessage[]): ChatModelRunOptions {
  return {
    messages,
    runConfig: {},
    abortSignal: new AbortController().signal,
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
})
