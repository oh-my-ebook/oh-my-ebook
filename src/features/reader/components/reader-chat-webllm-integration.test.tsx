import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubSupportedGpu, stubWorker } from '../../../test/web-llm-stubs'

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
  let restoreGpu: () => void

  beforeEach(() => {
    vi.resetModules()
    setupResizeObserverMock()
    stubWorker()
    restoreGpu = stubSupportedGpu()
  })

  afterEach(() => {
    restoreGpu()
    vi.unstubAllGlobals()
    vi.doUnmock('@mlc-ai/web-llm')
  })

  it('입력한 질문 텍스트가 그대로 엔진 요청에 실린다', async () => {
    const create = vi.fn(async (_request: { messages: { role: string; content: string }[] }) => ({
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: '답변' } }] }
      },
    }))
    const engine = { chat: { completions: { create } }, interruptGenerate: vi.fn() }
    vi.doMock('@mlc-ai/web-llm', () => ({
      CreateWebWorkerMLCEngine: vi.fn(async () => engine),
    }))

    const { ReaderChat } = await import('./reader-chat')
    const user = userEvent.setup()
    render(<ReaderChat />)

    const input = screen.getByRole('textbox', { name: '질문 입력' })
    await user.type(input, '실제 질문 내용')
    await user.keyboard('{Enter}')

    await vi.waitFor(() => expect(create).toHaveBeenCalled())
    expect(create.mock.calls[0]?.[0].messages.at(-1)).toEqual({
      role: 'user',
      content: '실제 질문 내용',
    })
    // 엔진에 요청이 실린 것만으로는 화면에 답변이 그려지는지 보장되지 않는다.
    // 실제 스트리밍 응답이 Thread UI까지 렌더링되는지 끝까지 확인한다.
    expect(await screen.findByText('답변')).toBeInTheDocument()
  })
})
