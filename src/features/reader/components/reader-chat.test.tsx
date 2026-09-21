import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatModelAdapter, ChatModelRunResult } from '@assistant-ui/react'
import { createPromiseController } from '../../../test/promise-controller'
import { createMockChatModelAdapter, type MockResponder } from '../lib/mock-chat-adapter'
import { useWebLlmModelStore, type WebLlmModelStatus } from '../lib/web-llm/webllm-model'
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
    act(() => useWebLlmModelStore.setState(useWebLlmModelStore.getInitialState(), true))
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

  it('책 분석이 끝나지 않았으면 안내하고 질문 전송을 막는다', async () => {
    setupResizeObserverMock()
    useWebLlmModelStore.setState({ status: 'ready' })
    const { respond } = createControllableRespond(0)

    render(
      <ReaderChat analysisStatus="analyzing" chatModel={createMockChatModelAdapter(respond)} />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('책 분석이 완료된 후 질문할 수 있습니다.')
    expect(screen.getByRole('textbox', { name: MESSAGE_INPUT_NAME })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '이 페이지 요약' })).not.toBeInTheDocument()
    expect(respond).not.toHaveBeenCalled()
  })

  it('인용이 없으면 이 페이지 요약 질문을 바로 보낼 수 있다', async () => {
    setupResizeObserverMock()
    useWebLlmModelStore.setState({ status: 'ready' })
    const user = userEvent.setup()
    const respond = vi.fn<MockResponder>(async function* respond() {
      yield '요약 답변'
    })
    render(<ReaderChat chatModel={createMockChatModelAdapter(respond)} currentPage={3} />)

    await user.click(screen.getByRole('button', { name: '이 페이지 요약' }))

    await waitFor(() => expect(respond).toHaveBeenCalledOnce())
    expect(respond.mock.calls[0]?.[0]).toBe('이 페이지에 대해 요약해줘')
    expect(screen.getByText('이 페이지에 대해 요약해줘')).toBeInTheDocument()
    expect(screen.queryByText(/현재 페이지의 핵심 내용을 2문장으로/)).not.toBeInTheDocument()
  })

  it('선택 문장을 채팅에 추가하면 전송하지 않고 인용 미리보기를 표시한다', async () => {
    setupResizeObserverMock()
    useWebLlmModelStore.setState({ status: 'ready' })
    const user = userEvent.setup()
    const { respond } = createControllableRespond(0)
    const onQuoteRequestHandled = vi.fn()
    render(
      <ReaderChat
        chatModel={createMockChatModelAdapter(respond)}
        onQuoteRequestHandled={onQuoteRequestHandled}
        quoteRequest={{
          action: 'attach',
          id: 1,
          pageNumber: 3,
          text: '선택한 문장',
        }}
      />,
    )

    expect(await screen.findByText('선택한 문장')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '이 페이지 요약' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: MESSAGE_INPUT_NAME })).toHaveValue('')
    expect(respond).not.toHaveBeenCalled()
    expect(onQuoteRequestHandled).toHaveBeenCalledWith(1)

    await user.click(screen.getByRole('button', { name: '인용 삭제' }))
    expect(screen.getByRole('button', { name: '이 페이지 요약' })).toBeInTheDocument()
  })

  it('여러 선택 문장을 인용 블록으로 누적하고 각각 삭제할 수 있다', async () => {
    setupResizeObserverMock()
    useWebLlmModelStore.setState({ status: 'ready' })
    const user = userEvent.setup()
    const { respond } = createControllableRespond(0)
    const chatModel = createMockChatModelAdapter(respond)
    const onQuoteRequestHandled = vi.fn()
    const { rerender } = render(
      <ReaderChat
        chatModel={chatModel}
        onQuoteRequestHandled={onQuoteRequestHandled}
        quoteRequest={{ action: 'attach', id: 1, pageNumber: 3, text: '첫 번째 인용문' }}
      />,
    )

    expect(await screen.findByText('첫 번째 인용문')).toBeInTheDocument()
    rerender(
      <ReaderChat
        chatModel={chatModel}
        onQuoteRequestHandled={onQuoteRequestHandled}
        quoteRequest={{ action: 'attach', id: 2, pageNumber: 4, text: '두 번째 인용문' }}
      />,
    )

    expect(await screen.findByText('두 번째 인용문')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '첨부한 인용문' })).toHaveClass('flex-wrap')
    expect(screen.getByRole('button', { name: '인용 1 삭제' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '인용 2 삭제' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '인용 1 삭제' }))
    expect(screen.queryByText('첫 번째 인용문')).not.toBeInTheDocument()
    expect(screen.getByText('두 번째 인용문')).toBeInTheDocument()
  })

  it('자세히 설명을 선택하면 인용과 설명 프롬프트를 함께 전송한다', async () => {
    setupResizeObserverMock()
    useWebLlmModelStore.setState({ status: 'ready' })
    const respond = vi.fn<MockResponder>(async function* respond() {
      yield '설명 답변'
    })
    render(
      <ReaderChat
        chatModel={createMockChatModelAdapter(respond)}
        onQuoteRequestHandled={vi.fn()}
        quoteRequest={{
          action: 'explain',
          id: 1,
          pageNumber: 3,
          text: '선택한 문장',
        }}
      />,
    )

    await waitFor(() => expect(respond).toHaveBeenCalledOnce())
    expect(respond.mock.calls[0]?.[0]).toBe(
      '선택한 문장을 현재 페이지와 책의 맥락에 맞춰 자세히 설명해 주세요.',
    )
    expect(await screen.findByText('선택한 문장')).toBeInTheDocument()
  })

  it('모델 다운로드 버튼으로 준비 상태를 확인할 수 있다', async () => {
    setupResizeObserverMock()
    const user = userEvent.setup()
    const controller = createPromiseController<void>()
    prepareWebLlmModelMock.mockImplementation(async () => {
      useWebLlmModelStore.setState({ status: 'loading', phase: 'downloading' })
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
    useWebLlmModelStore.setState({
      status: 'loading',
      phase: 'downloading',
      progress: 37,
      progressDetail: '4/30개 파일 · 123MB',
    })
    const { respond } = createControllableRespond(0)

    render(<ReaderChat chatModel={createMockChatModelAdapter(respond)} />)

    expect(screen.getByText('모델 다운로드 중 · 37% · 4/30개 파일 · 123MB')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '37')
  })

  it.each([
    ['loading-gpu', '저장된 모델을 GPU에 올리는 중'],
    ['compiling', 'GPU 실행 준비 중'],
    ['preparing', '모델 준비 중'],
  ] as const)('%s 단계는 다운로드와 구분해서 표시한다', (phase, label) => {
    setupResizeObserverMock()
    useWebLlmModelStore.setState({ status: 'loading', phase, progress: 50 })
    const { respond } = createControllableRespond(0)
    render(<ReaderChat chatModel={createMockChatModelAdapter(respond)} />)

    expect(screen.getByText(`${label} · 50%`)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: label })).toHaveAttribute('aria-valuenow', '50')
    expect(screen.getByRole('button', { name: '모델 준비 중' })).toBeDisabled()
    expect(screen.queryByText(/다운로드 중/)).not.toBeInTheDocument()
  })

  // 첫 샤드가 받아지기 전엔 web-llm이 진행률 자체를 보고하지 않아 0%가 오래 유지될 수 있다.
  // 값이 없다는 사실(0이 아니라 알 수 없음)을 그대로 알려야 멈춘 것처럼 보이지 않는다.
  it('첫 진행률이 들어오기 전에는 진행률 표시줄을 알 수 없는 진행 중 상태로 보여준다', () => {
    setupResizeObserverMock()
    useWebLlmModelStore.setState({ status: 'loading', progress: 0 })
    const { respond } = createControllableRespond(0)

    render(<ReaderChat chatModel={createMockChatModelAdapter(respond)} />)

    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
  })

  it.each<[string, WebLlmModelStatus]>([
    ['다운로드 전', 'idle'],
    ['준비 완료', 'ready'],
    ['다운로드 실패', 'error'],
  ])('%s 상태에는 진행률 표시줄을 보여주지 않는다', (_case, status) => {
    setupResizeObserverMock()
    useWebLlmModelStore.setState({ status })
    const { respond } = createControllableRespond(0)

    render(<ReaderChat chatModel={createMockChatModelAdapter(respond)} />)

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: '모델 준비 재시도' })).toBeInTheDocument()
    expect(
      screen.getByText(
        '모델 다운로드 연결에 실패했습니다. VPN이나 네트워크 설정을 확인하고 다시 시도해 주세요.',
      ),
    ).toHaveClass('text-destructive/90')
  })

  it('모델 다운로드 중에는 버튼의 접근 가능한 이름도 진행 상태를 알려준다', () => {
    setupResizeObserverMock()
    useWebLlmModelStore.setState({ status: 'loading', phase: 'downloading' })
    const { respond } = createControllableRespond(0)

    render(<ReaderChat chatModel={createMockChatModelAdapter(respond)} />)

    expect(screen.getByRole('button', { name: '모델 다운로드 중' })).toBeInTheDocument()
  })

  it.each<[string, WebLlmModelStatus]>([
    ['다운로드 전', 'idle'],
    ['다운로드 중', 'loading'],
    ['다운로드 실패', 'error'],
  ])('모델이 %s 상태면 질문을 입력할 수 없다', (_case, status) => {
    setupResizeObserverMock()
    useWebLlmModelStore.setState({ status })
    const { respond } = createControllableRespond(0)

    render(<ReaderChat chatModel={createMockChatModelAdapter(respond)} />)

    expect(screen.getByRole('textbox', { name: MESSAGE_INPUT_NAME })).toBeDisabled()
  })

  it('입력해 둔 질문이 있어도 모델에 문제가 생기면 보낼 수 없다', async () => {
    setupResizeObserverMock()
    const user = userEvent.setup()
    useWebLlmModelStore.setState({ status: 'ready' })
    const { respond } = createControllableRespond(0)
    render(<ReaderChat chatModel={createMockChatModelAdapter(respond)} />)
    await user.type(screen.getByRole('textbox', { name: MESSAGE_INPUT_NAME }), '질문')

    act(() => useWebLlmModelStore.setState({ status: 'error' }))

    expect(screen.getByRole('button', { name: SEND_BUTTON_NAME })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: MESSAGE_INPUT_NAME })).toBeDisabled()
  })

  it('Enter로 전송하면 질문이 먼저 표시되고 응답이 스트리밍 조각으로 갱신되며 완료되면 스트리밍 상태가 해제된다', async () => {
    setupResizeObserverMock()
    useWebLlmModelStore.setState({ status: 'ready' })
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
    useWebLlmModelStore.setState({ status: 'ready' })
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
    useWebLlmModelStore.setState({ status: 'ready' })
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
    useWebLlmModelStore.setState({ status: 'ready' })
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
    useWebLlmModelStore.setState({ status: 'ready' })
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
    useWebLlmModelStore.setState({ status: 'ready' })
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
    useWebLlmModelStore.setState({ status: 'ready' })
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

  it('전송한 질문에 현재 페이지 본문이 함께 전달된다', async () => {
    setupResizeObserverMock()
    useWebLlmModelStore.setState({ status: 'ready' })
    const user = userEvent.setup()
    const receivedContexts: Parameters<MockResponder>[1][] = []
    const respond = vi.fn<MockResponder>(async function* respond(_question, context) {
      receivedContexts.push(context)
      yield '답변'
    })
    const adapter = createMockChatModelAdapter(respond)
    render(
      <ReaderChat chatModel={adapter} currentPage={5} currentPageText={'첫 문장.\n둘째 문장.'} />,
    )

    const input = screen.getByRole('textbox', { name: MESSAGE_INPUT_NAME })
    await user.type(input, '질문')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(receivedContexts).toHaveLength(1))
    expect(receivedContexts[0]?.system).toContain('<page_context>')
    expect(receivedContexts[0]?.system).toContain('첫 문장.\n둘째 문장.')
    expect(receivedContexts[0]?.system).toContain('You MUST answer in Korean.')
    expect(receivedContexts[0]?.system).toContain(
      'The user is currently reading page 5 of the PDF.',
    )
    expect(receivedContexts[0]?.system).toMatch(
      /If space is limited, omit details but always complete the final sentence\.$/,
    )
  })

  it('값이 있는 도서 메타데이터만 컨텍스트에 함께 전달한다', async () => {
    setupResizeObserverMock()
    useWebLlmModelStore.setState({ status: 'ready' })
    const user = userEvent.setup()
    const receivedContexts: Parameters<MockResponder>[1][] = []
    const respond = vi.fn<MockResponder>(async function* respond(_question, context) {
      receivedContexts.push(context)
      yield '답변'
    })
    const adapter = createMockChatModelAdapter(respond)
    render(
      <ReaderChat
        bookMetadata={{
          author: '저자',
          publisher: '출판사',
          title: '도서 제목',
        }}
        chatModel={adapter}
        currentPage={5}
        currentPageText="페이지 본문"
      />,
    )

    await user.type(screen.getByRole('textbox', { name: MESSAGE_INPUT_NAME }), '질문')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(receivedContexts).toHaveLength(1))
    expect(receivedContexts[0]?.system).toContain('<book_metadata>')
    expect(receivedContexts[0]?.system).toContain('제목: 도서 제목')
    expect(receivedContexts[0]?.system).toContain('저자: 저자')
    expect(receivedContexts[0]?.system).toContain('출판사: 출판사')
    expect(receivedContexts[0]?.system).not.toContain('주제:')
    expect(receivedContexts[0]?.system).not.toContain('키워드:')
    expect(receivedContexts[0]?.system).not.toContain('null')
  })

  it('답변 하단에 페이지별 인용 출처를 나열하고 PDF 위치로 이동한다', async () => {
    setupResizeObserverMock()
    useWebLlmModelStore.setState({ status: 'ready' })
    const user = userEvent.setup()
    const onCitationNavigate = vi.fn()
    const finish = createPromiseController<void>()
    const citationAdapter: ChatModelAdapter = {
      async *run() {
        yield { content: [{ type: 'text', text: '검색 발췌를 사용한 답변' }] }
        await finish.promise
        yield {
          content: [
            { type: 'text', text: '검색 발췌를 사용한 답변' },
            {
              type: 'data',
              name: 'book-citations',
              data: {
                chunks: [
                  {
                    id: 'chunk-1',
                    ordinal: 0,
                    text: '호버 카드에 보여 줄 책 본문',
                    tokenCount: 7,
                    score: 1.5,
                    sources: [{ pageNumber: 7, startLineIndex: 2, endLineIndex: 4 }],
                  },
                  {
                    id: 'chunk-2',
                    ordinal: 1,
                    text: '두 번째 인용 출처 본문',
                    tokenCount: 4,
                    score: 1.2,
                    sources: [{ pageNumber: 9, startLineIndex: 0, endLineIndex: 1 }],
                  },
                ],
              },
            },
          ],
        } satisfies ChatModelRunResult
      },
    }
    render(<ReaderChat chatModel={citationAdapter} onCitationNavigate={onCitationNavigate} />)

    await user.type(screen.getByRole('textbox', { name: MESSAGE_INPUT_NAME }), '질문')
    await user.keyboard('{Enter}')
    expect(await screen.findByText('검색 발췌를 사용한 답변')).toBeInTheDocument()
    expect(document.querySelectorAll('.aui-md[data-status="running"]')).toHaveLength(1)
    expect(document.querySelector('[data-slot="aui_assistant-message-indicator"]')).toBeNull()
    expect(screen.queryByRole('button', { name: '7페이지 인용 출처' })).not.toBeInTheDocument()

    finish.resolve()
    const citationTrigger = await screen.findByRole('button', { name: '7페이지 인용 출처' })
    expect(document.querySelector('.aui-md[data-status="running"]')).toBeNull()
    expect(document.querySelector('[data-slot="aui_assistant-message-indicator"]')).toBeNull()
    expect(screen.getByRole('button', { name: '9페이지 인용 출처' })).toBeInTheDocument()
    await user.hover(citationTrigger)

    expect(await screen.findByText('호버 카드에 보여 줄 책 본문')).toBeInTheDocument()
    expect(document.querySelector('[data-side="bottom"]')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: '7페이지 원문으로 이동' }))
    expect(onCitationNavigate).toHaveBeenCalledWith({
      pageNumber: 7,
      startLineIndex: 2,
      endLineIndex: 4,
    })
  })

  it('Tab으로 입력 중인 질문에서 전송 조작부로 이동할 수 있다', async () => {
    setupResizeObserverMock()
    useWebLlmModelStore.setState({ status: 'ready' })
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
    useWebLlmModelStore.setState({ status: 'ready' })
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
    useWebLlmModelStore.setState({ status: 'ready' })
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
