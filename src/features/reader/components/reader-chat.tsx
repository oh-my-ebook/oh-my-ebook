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

interface CurrentPageInstructionsProps {
  currentPage?: number
}

// 전송 시점의 현재 페이지 번호를 모델 컨텍스트(system)에 실어, 어댑터가 매 요청마다 최신 값을 읽게 한다.
function CurrentPageInstructions({ currentPage }: CurrentPageInstructionsProps) {
  useAssistantInstructions({
    instruction: `사용자가 현재 PDF ${currentPage}페이지를 읽고 있습니다.`,
    disabled: currentPage === undefined,
  })
  return null
}

export function ReaderChat({ chatModel = mockChatModelAdapter, currentPage }: ReaderChatProps) {
  const runtime = useLocalRuntime(chatModel)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <CurrentPageInstructions currentPage={currentPage} />
      <Thread />
    </AssistantRuntimeProvider>
  )
}
