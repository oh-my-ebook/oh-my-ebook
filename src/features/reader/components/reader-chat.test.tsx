import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPromiseController } from '../../../test/promise-controller'
import { createMockChatModelAdapter, type MockResponder } from '../lib/mock-chat-adapter'
import { useWebLlmModelStore } from '../lib/web-llm/webllm-model'
import { ReaderChat } from './reader-chat'

const prepareWebLlmModelMock = vi.hoisted(() => vi.fn(async () => undefined))

// 다운로드 버튼이 jsdom에 없는 navigator.gpu 등 실제 WebGPU 경로를 타지 않도록 준비 함수만 바꾼다.
// 상태 store는 실제 것을 쓰고 테스트에서 setState로 원하는 상태를 만든다.
vi.mock('../lib/web-llm/webllm-model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/web-llm/webllm-model')>()),
  prepareWebLlmModel: prepareWebLlmModelMock,
}))

// 실제 테스트는 전부 ReaderChat에 chatModel prop을 명시하므로 이 기본값은 쓰이지 않아야 한다.
// 누군가 prop 지정을 깜빡하면 실제 WebGPU 경로 대신 이 오류로 바로 드러나게 한다.
vi.mock('../lib/web-llm/webllm-chat-adapter', async () => {
  const { createMockChatModelAdapter } = await import('../lib/mock-chat-adapter')
  // oxlint-disable-next-line require-yield
  async function* unexpectedRespond(): AsyncGenerator<string, void> {
    throw new Error('이 테스트는 ReaderChat에 chatModel prop을 지정하지 않았습니다.')
  }
  return { webLlmChatModelAdapter: createMockChatModelAdapter(unexpectedRespond) }
})

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

const MESSAGE_INPUT_NAME = '질문 입력'
const SEND_BUTTON_NAME = '질문 보내기'
const STOP_BUTTON_NAME = '답변 중지'
const RETRY_BUTTON_NAME = '다시 답변받기'

describe('ReaderChat', () => {
  afterEach(() => {
    prepareWebLlmModelMock.mockReset()
    useWebLlmModelStore.setState(useWebLlmModelStore.getInitialState(), true)
    vi.unstubAllGlobals()
  })

  it('대화를 시작하기 전에는 질문을 안내하는 문구를 보여준다', () => {
    setupResizeObserverMock()
    render(<ReaderChat />)

    expect(screen.getByText('어떤 것에 대해 알아볼까요?')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: MESSAGE_INPUT_NAME })).toHaveAttribute(
      'placeholder',
      '질문을 입력하세요',
    )
  })

  it('모델 다운로드 버튼으로 준비 상태를 확인할 수 있다', async () => {
    setupResizeObserverMock()
    const user = userEvent.setup()
    const controller = createPromiseController<void>()
    prepareWebLlmModelMock.mockImplementation(async () => {
      useWebLlmModelStore.setState({ status: 'loading' })
      await controller.promise
      useWebLlmModelStore.setState({ status: 'ready' })
    })
    const { respond } = createControllableRespond(0)
    render(<ReaderChat chatModel={createMockChatModelAdapter(respond)} />)

    const downloadButton = screen.getByRole('button', { name: '모델 다운로드' })
    await user.click(downloadButton)

    expect(downloadButton).toBeDisabled()
    expect(downloadButton).toHaveTextContent('다운로드 중')

    controller.resolve()
    expect(await screen.findByText('준비 완료')).toBeInTheDocument()
    expect(prepareWebLlmModelMock).toHaveBeenCalledOnce()
  })

  it('다운로드 버튼 클릭이 예상치 못하게 실패하면 콘솔에 원인을 남긴다', async () => {
    setupResizeObserverMock()
    const user = userEvent.setup()
    const unexpectedError = new Error('예상치 못한 오류')
    prepareWebLlmModelMock.mockRejectedValue(unexpectedError)
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { respond } = createControllableRespond(0)
    render(<ReaderChat chatModel={createMockChatModelAdapter(respond)} />)

    await user.click(screen.getByRole('button', { name: '모델 다운로드' }))

    await waitFor(() =>
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(String), unexpectedError),
    )
    consoleErrorSpy.mockRestore()
  })

  it('모델 다운로드 진행률을 표시한다', () => {
    setupResizeObserverMock()
    useWebLlmModelStore.setState({ status: 'loading', progress: 37 })
    const { respond } = createControllableRespond(0)

    render(<ReaderChat chatModel={createMockChatModelAdapter(respond)} />)

    expect(screen.getByText('모델을 다운로드하고 있습니다. 37%')).toBeInTheDocument()
  })

  it('모델 다운로드 실패 원인을 표시한다', () => {
    setupResizeObserverMock()
    useWebLlmModelStore.setState({
      status: 'error',
      error:
        '모델 다운로드 연결에 실패했습니다. VPN이나 네트워크 설정을 확인하고 다시 시도해 주세요.',
    })
    const { respond } = createControllableRespond(0)

    render(<ReaderChat chatModel={createMockChatModelAdapter(respond)} />)

    expect(screen.getByRole('status')).toHaveTextContent('모델 다운로드 연결에 실패했습니다.')
    expect(screen.getByRole('button', { name: '모델 다운로드 재시도' })).toBeInTheDocument()
  })

  it('모델 다운로드 중에는 버튼의 접근 가능한 이름도 진행 상태를 알려준다', () => {
    setupResizeObserverMock()
    useWebLlmModelStore.setState({ status: 'loading' })
    const { respond } = createControllableRespond(0)

    render(<ReaderChat chatModel={createMockChatModelAdapter(respond)} />)

    expect(screen.getByRole('button', { name: '모델 다운로드 중' })).toBeInTheDocument()
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

  it('전송한 질문에 현재 페이지 번호가 함께 전달된다', async () => {
    setupResizeObserverMock()
    const user = userEvent.setup()
    const receivedContexts: Parameters<MockResponder>[1][] = []
    const respond = vi.fn<MockResponder>(async function* respond(_question, context) {
      receivedContexts.push(context)
      yield '답변'
    })
    const adapter = createMockChatModelAdapter(respond)
    render(<ReaderChat chatModel={adapter} currentPage={5} />)

    const input = screen.getByRole('textbox', { name: MESSAGE_INPUT_NAME })
    await user.type(input, '질문')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(receivedContexts).toHaveLength(1))
    expect(receivedContexts[0]?.system).toContain('5')
  })

  it('Tab으로 입력 중인 질문에서 전송 조작부로 이동할 수 있다', async () => {
    setupResizeObserverMock()
    const user = userEvent.setup()
    const { respond } = createControllableRespond(1)
    const adapter = createMockChatModelAdapter(respond)
    render(<ReaderChat chatModel={adapter} />)

    const input = screen.getByRole('textbox', { name: MESSAGE_INPUT_NAME })
    await user.type(input, '질문')

    await user.tab()
    expect(screen.getByRole('button', { name: SEND_BUTTON_NAME })).toHaveFocus()
  })

  it('실패 후 Tab으로 재시도 조작부로 이동할 수 있다', async () => {
    setupResizeObserverMock()
    const user = userEvent.setup()
    const controller = createPromiseController<void>()
    // 첫 조각이 도착하기 전에 실패하는 경우를 흉내 내므로 이 제너레이터는 의도적으로 yield하지 않는다.
    // oxlint-disable-next-line require-yield
    const respond = vi.fn<MockResponder>(async function* respond() {
      await controller.promise
      throw new Error('실패')
    })
    const adapter = createMockChatModelAdapter(respond)
    render(<ReaderChat chatModel={adapter} />)

    const input = screen.getByRole('textbox', { name: MESSAGE_INPUT_NAME })
    await user.type(input, '질문')
    await user.keyboard('{Enter}')
    controller.resolve()
    const retryButton = await screen.findByRole('button', { name: RETRY_BUTTON_NAME })

    // 재시도 조작부는 대화 내역 쪽(입력창보다 앞)에 있어 Shift+Tab으로 거슬러 올라가야 닿는다.
    await user.tab({ shift: true })
    expect(retryButton).toHaveFocus()
  })

  it('스트리밍 중인 응답의 갱신과 완료를 보조 기술로 확인할 수 있다', async () => {
    setupResizeObserverMock()
    const { respond, controllers } = createControllableRespond(1)
    const adapter = createMockChatModelAdapter(respond)
    render(<ReaderChat chatModel={adapter} />)

    const user = userEvent.setup()
    const input = screen.getByRole('textbox', { name: MESSAGE_INPUT_NAME })
    await user.type(input, '질문')
    await user.keyboard('{Enter}')

    const liveRegion = await screen.findByRole('log')
    controllers[0]?.resolve('답변')
    expect(await screen.findByText('답변', { selector: '[role="log"] *' })).toBeInTheDocument()
    expect(liveRegion).toHaveAttribute('aria-live', 'polite')
  })
})
