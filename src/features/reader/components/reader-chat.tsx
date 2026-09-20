import {
  AssistantRuntimeProvider,
  useAssistantInstructions,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react'
import { Thread, type ThreadComponents } from '@/components/assistant-ui/elements/thread.aui'
import { webLlmChatModelAdapter } from '../lib/web-llm/webllm-chat-adapter'
import { useWebLlmModelStore } from '../lib/web-llm/webllm-model'
import { ModelDownloadAlert } from './model-download-alert'

// 부모가 다시 렌더링될 때 메시지 영역까지 다시 그리지 않도록 모듈 범위에 둔다.
const THREAD_COMPONENTS: ThreadComponents = {
  Welcome: () => (
    <div className="flex flex-1 items-center justify-center px-4">
      <p className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both text-center text-lg font-medium delay-50 duration-300 ease-out motion-reduce:animate-none">
        어떤 것에 대해 알아볼까요?
      </p>
    </div>
  ),
}

interface ReaderChatProps {
  chatModel?: ChatModelAdapter
  currentPage?: number
}

interface ReaderChatContentProps {
  currentPage?: number
}

// AssistantRuntimeProvider의 자식이어야 useAssistantInstructions가 런타임 컨텍스트를 읽을 수 있어
// Thread 렌더링과 함께 이 컴포넌트에 둔다. 전송 시점의 현재 페이지 번호를 모델 컨텍스트(system)에
// 실어, 어댑터가 매 요청마다 최신 값을 읽게 한다.
function ReaderChatContent({ currentPage }: ReaderChatContentProps) {
  const isModelReady = useWebLlmModelStore((state) => state.status === 'ready')
  useAssistantInstructions({
    instruction: `사용자가 현재 PDF ${currentPage}페이지를 읽고 있습니다.`,
    disabled: currentPage === undefined,
  })

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <ModelDownloadAlert />
      <div className="min-h-0 flex-1">
        <Thread components={THREAD_COMPONENTS} composerDisabled={!isModelReady} />
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
