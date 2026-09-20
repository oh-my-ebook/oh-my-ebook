import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubSupportedGpu, stubWorker } from '../../../test/web-llm-stubs'
import { ReaderChat } from './reader-chat'

vi.mock('../lib/web-llm/webllm-tokenizer', () => ({
  loadWebLlmTokenCounter: async () => (text: string) => Array.from(text).length,
}))

const createCompletion = vi.hoisted(() =>
  vi.fn(async (_request: { messages: { role: string; content: string }[] }) => ({
    async *[Symbol.asyncIterator]() {
      yield { choices: [{ delta: { content: '답변' } }] }
    },
  })),
)

// 테스트 안에서 resetModules 후 ReaderChat을 다시 import하면 assistant-ui 전체를 새로 불러오는
// 시간이 테스트 제한 시간에 포함돼, 부하가 있는 환경에서 5초를 넘겨 실패한다.
// 이 파일은 테스트가 하나라 모델 싱글턴을 초기화할 필요가 없으므로 파일 단위 mock으로 둔다.
vi.mock('@mlc-ai/web-llm', () => ({
  CreateWebWorkerMLCEngine: vi.fn(async () => ({
    chat: { completions: { create: createCompletion } },
    interruptGenerate: vi.fn(),
  })),
}))

function setupResizeObserverMock() {
  class ResizeObserverMock {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
}

// ReaderChat이 실제로 렌더링될 때 useLocalRuntime + Thread가 만드는 ThreadMessage가
// webLlmChatModelAdapter의 toWebLlmMessages를 거쳐 엔진에 전달하는 실제 요청 형태를 확인한다.
// 다른 테스트는 전부 webLlmChatModelAdapter 자체를 Mock으로 치환해서, 이 경로는 지금까지
// 한 번도 검증된 적이 없다.
describe('ReaderChat + 실제 webLlmChatModelAdapter 연결', () => {
  const restoreGpu: (() => void)[] = []

  afterEach(() => {
    restoreGpu.splice(0).forEach((restore) => restore())
    vi.unstubAllGlobals()
  })

  it('입력한 질문 텍스트가 그대로 엔진 요청에 실린다', async () => {
    setupResizeObserverMock()
    stubWorker()
    restoreGpu.push(stubSupportedGpu())
    const user = userEvent.setup()
    render(<ReaderChat />)
    await user.click(screen.getByRole('button', { name: '모델 다운로드' }))
    await screen.findByText('준비 완료')

    await user.type(screen.getByRole('textbox', { name: '질문 입력' }), '실제 질문 내용')
    await user.keyboard('{Enter}')

    await vi.waitFor(() => expect(createCompletion).toHaveBeenCalled())
    expect(createCompletion.mock.calls[0]?.[0].messages.at(-1)).toEqual({
      role: 'user',
      content: '실제 질문 내용',
    })
    // 엔진에 요청이 실린 것만으로는 화면에 답변이 그려지는지 보장되지 않는다.
    // 실제 스트리밍 응답이 Thread UI까지 렌더링되는지 끝까지 확인한다.
    expect(await screen.findByText('답변')).toBeInTheDocument()
  })
})
