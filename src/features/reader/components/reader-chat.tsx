import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from '@assistant-ui/react'
import { Thread } from '@/components/assistant-ui/elements/thread.aui'
import { mockChatModelAdapter } from '../lib/mock-chat-adapter'

interface ReaderChatProps {
  chatModel?: ChatModelAdapter
  currentPage?: number
}

export function ReaderChat({ chatModel = mockChatModelAdapter }: ReaderChatProps) {
  const runtime = useLocalRuntime(chatModel)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  )
}
