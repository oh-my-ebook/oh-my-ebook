import {
  AssistantRuntimeProvider,
  useAssistantInstructions,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react'
import { useSyncExternalStore } from 'react'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  getWebLlmModelError,
  getWebLlmModelProgress,
  getWebLlmModelStatus,
  prepareWebLlmModel,
  subscribeWebLlmModelStatus,
  webLlmChatModelAdapter,
} from '../lib/web-llm/webllm-chat-adapter'

interface ReaderChatProps {
  chatModel?: ChatModelAdapter
  currentPage?: number
}

interface ReaderChatContentProps {
  currentPage?: number
}

const MODEL_STATUS_TEXT = {
  idle: '채팅 전에 로컬 모델을 준비하세요.',
  ready: '준비 완료',
}

function ModelDownloadAlert() {
  const status = useSyncExternalStore(
    subscribeWebLlmModelStatus,
    getWebLlmModelStatus,
    getWebLlmModelStatus,
  )
  const progress = useSyncExternalStore(
    subscribeWebLlmModelStatus,
    getWebLlmModelProgress,
    getWebLlmModelProgress,
  )
  const error = useSyncExternalStore(
    subscribeWebLlmModelStatus,
    getWebLlmModelError,
    getWebLlmModelError,
  )
  const isLoading = status === 'loading'
  const isReady = status === 'ready'
  const statusText = isLoading
    ? `모델을 다운로드하고 있습니다. ${progress}%`
    : status === 'error'
      ? (error ?? '모델 다운로드에 실패했습니다.')
      : MODEL_STATUS_TEXT[status]
  const buttonText = isLoading
    ? '다운로드 중'
    : isReady
      ? '완료'
      : status === 'error'
        ? '재시도'
        : '다운로드'

  return (
    <Alert
      className="shrink-0"
      role="status"
      variant={status === 'error' ? 'destructive' : 'default'}
    >
      <AlertTitle>Qwen2.5 1.5B</AlertTitle>
      <AlertDescription>{statusText}</AlertDescription>
      <AlertAction>
        <Button
          aria-label={
            isReady
              ? '모델 준비 완료'
              : isLoading
                ? '모델 다운로드 중'
                : status === 'error'
                  ? '모델 다운로드 재시도'
                  : '모델 다운로드'
          }
          disabled={isLoading || isReady}
          onClick={() => prepareWebLlmModel().catch(() => undefined)}
          size="xs"
          type="button"
          variant="outline"
        >
          {buttonText}
        </Button>
      </AlertAction>
    </Alert>
  )
}

// AssistantRuntimeProvider의 자식이어야 useAssistantInstructions가 런타임 컨텍스트를 읽을 수 있어
// Thread 렌더링과 함께 이 컴포넌트에 둔다. 전송 시점의 현재 페이지 번호를 모델 컨텍스트(system)에
// 실어, 어댑터가 매 요청마다 최신 값을 읽게 한다.
function ReaderChatContent({ currentPage }: ReaderChatContentProps) {
  useAssistantInstructions({
    instruction: `사용자가 현재 PDF ${currentPage}페이지를 읽고 있습니다.`,
    disabled: currentPage === undefined,
  })

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <ModelDownloadAlert />
      <div className="min-h-0 flex-1">
        <Thread />
      </div>
    </div>
  )
}

export function ReaderChat({ chatModel = webLlmChatModelAdapter, currentPage }: ReaderChatProps) {
  const runtime = useLocalRuntime(chatModel)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ReaderChatContent currentPage={currentPage} />
    </AssistantRuntimeProvider>
  )
}
