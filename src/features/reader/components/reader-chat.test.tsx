import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPromiseController } from '../../../test/promise-controller'
import { createMockChatModelAdapter, type MockResponder } from '../lib/mock-chat-adapter'
import { ReaderChat } from './reader-chat'

// Thread가 내부적으로 ResizeObserver를 사용해 뷰포트 크기를 관찰하므로 jsdom에 없는 API를 채워준다.
function setupResizeObserverMock() {
  class ResizeObserverMock {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
}

function createControllableRespond(chunkCount: number) {
  const controllers = Array.from({ length: chunkCount }, () => createPromiseController<string>())
  async function* baseRespond(): AsyncGenerator<string, void> {
    for (const controller of controllers) {
      yield await controller.promise
    }
  }
  const respond = vi.fn<MockResponder>(baseRespond)

  return { respond, controllers }
}

const MESSAGE_INPUT_NAME = 'Message input'
const SEND_BUTTON_NAME = 'Send message'
const STOP_BUTTON_NAME = 'Stop generating'
const RETRY_BUTTON_NAME = 'Refresh'

describe('ReaderChat', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Enter로 전송하면 질문이 먼저 표시되고 응답이 스트리밍 조각으로 갱신되며 완료되면 스트리밍 상태가 해제된다', async () => {
    setupResizeObserverMock()
    const user = userEvent.setup()
    const { respond, controllers } = createControllableRespond(2)
    const adapter = createMockChatModelAdapter(respond)
    render(<ReaderChat chatModel={adapter} />)

    const input = screen.getByRole('textbox', { name: MESSAGE_INPUT_NAME })
    await user.type(input, '안녕')
    await user.keyboard('{Enter}')

    expect(await screen.findByText('안녕')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: STOP_BUTTON_NAME })).toBeInTheDocument()

    controllers[0]?.resolve('반갑')
    expect(await screen.findByText('반갑')).toBeInTheDocument()

    controllers[1]?.resolve('습니다')
    expect(await screen.findByText('반갑습니다')).toBeInTheDocument()

    expect(await screen.findByRole('button', { name: SEND_BUTTON_NAME })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: STOP_BUTTON_NAME })).not.toBeInTheDocument()
  })

  it('Shift+Enter는 줄바꿈만 하고 전송하지 않는다', async () => {
    setupResizeObserverMock()
    const user = userEvent.setup()
    const { respond } = createControllableRespond(1)
    const adapter = createMockChatModelAdapter(respond)
    render(<ReaderChat chatModel={adapter} />)

    const input = screen.getByRole('textbox', { name: MESSAGE_INPUT_NAME })
    await user.type(input, '첫줄')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    await user.type(input, '둘째줄')

    expect(input).toHaveValue('첫줄\n둘째줄')
    expect(respond).not.toHaveBeenCalled()
  })

  it('빈 값이나 공백만 있는 입력은 전송하지 않는다', async () => {
    setupResizeObserverMock()
    const user = userEvent.setup()
    const { respond } = createControllableRespond(0)
    const adapter = createMockChatModelAdapter(respond)
    render(<ReaderChat chatModel={adapter} />)

    const input = screen.getByRole('textbox', { name: MESSAGE_INPUT_NAME })
    await user.type(input, '   ')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(input).toHaveValue('   '))
    expect(respond).not.toHaveBeenCalled()
  })

  it('응답을 받는 동안 새 질문 전송이 비활성화된다', async () => {
    setupResizeObserverMock()
    const user = userEvent.setup()
    const { respond, controllers } = createControllableRespond(1)
    const adapter = createMockChatModelAdapter(respond)
    render(<ReaderChat chatModel={adapter} />)

    const input = screen.getByRole('textbox', { name: MESSAGE_INPUT_NAME })
    await user.type(input, '첫번째 질문')
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('button', { name: STOP_BUTTON_NAME })).toBeInTheDocument()
    expect(respond).toHaveBeenCalledTimes(1)

    await user.type(input, '두번째 질문')
    await user.keyboard('{Enter}')

    expect(respond).toHaveBeenCalledTimes(1)
    expect(input).toHaveValue('두번째 질문\n')

    controllers[0]?.resolve('완료된 답변')
    expect(await screen.findByRole('button', { name: SEND_BUTTON_NAME })).toBeInTheDocument()
  })

  it('응답 생성에 실패하면 오류를 안내하고 재시도 조작을 제공한다', async () => {
    setupResizeObserverMock()
    const user = userEvent.setup()
    const controller = createPromiseController<void>()
    // 첫 조각이 도착하기 전에 실패하는 경우를 흉내 내므로 이 제너레이터는 의도적으로 yield하지 않는다.
    // oxlint-disable-next-line require-yield
    const respond = vi.fn<MockResponder>(async function* respond() {
      await controller.promise
      throw new Error('응답 생성 실패')
    })
    const adapter = createMockChatModelAdapter(respond)
    render(<ReaderChat chatModel={adapter} />)

    const input = screen.getByRole('textbox', { name: MESSAGE_INPUT_NAME })
    await user.type(input, '질문')
    await user.keyboard('{Enter}')
    controller.resolve()

    expect(await screen.findByRole('alert')).toHaveTextContent('응답 생성 실패')
    expect(await screen.findByRole('button', { name: RETRY_BUTTON_NAME })).toBeInTheDocument()
  })

  it('재시도하면 같은 질문으로 다시 응답을 받는다', async () => {
    setupResizeObserverMock()
    const user = userEvent.setup()
    let callCount = 0
    const firstController = createPromiseController<void>()
    const secondController = createPromiseController<string>()
    const respond = vi.fn<MockResponder>(async function* respond(question) {
      callCount += 1
      if (callCount === 1) {
        await firstController.promise
        throw new Error('첫 시도 실패')
      }
      yield `${question} 답변: ${await secondController.promise}`
    })
    const adapter = createMockChatModelAdapter(respond)
    render(<ReaderChat chatModel={adapter} />)

    const input = screen.getByRole('textbox', { name: MESSAGE_INPUT_NAME })
    await user.type(input, '같은 질문')
    await user.keyboard('{Enter}')
    firstController.resolve()

    const retryButton = await screen.findByRole('button', { name: RETRY_BUTTON_NAME })
    await user.click(retryButton)

    await waitFor(() => expect(respond).toHaveBeenCalledTimes(2))
    expect(respond.mock.calls[1]?.[0]).toBe('같은 질문')

    secondController.resolve('재시도 성공')
    expect(await screen.findByText('같은 질문 답변: 재시도 성공')).toBeInTheDocument()
  })
})
