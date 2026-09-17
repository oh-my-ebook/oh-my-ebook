import {
  AssistantRuntimeProvider,
  useAssistantInstructions,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'
import { mockChatModelAdapter } from '../lib/mock-chat-adapter'

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
  useAssistantInstructions({
    instruction: `사용자가 현재 PDF ${currentPage}페이지를 읽고 있습니다.`,
    disabled: currentPage === undefined,
  })

  return <Thread />
}

export function ReaderChat({ chatModel = mockChatModelAdapter, currentPage }: ReaderChatProps) {
  const runtime = useLocalRuntime(chatModel)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ReaderChatContent currentPage={currentPage} />
    </AssistantRuntimeProvider>
  )
}
