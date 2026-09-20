import { AuiIf, ThreadPrimitive } from '@assistant-ui/react'
import { Button } from '@/components/ui/button'

const PAGE_SUMMARY_QUESTION = '이 페이지에 대해 요약해줘'

// 부모가 다시 렌더링될 때 메시지 영역까지 다시 그리지 않도록 모듈 범위에 둔다.
export function ReaderChatWelcome() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
      <p className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both text-center text-lg font-medium delay-50 duration-300 ease-out motion-reduce:animate-none">
        어떤 것에 대해 알아볼까요?
      </p>
      <AuiIf condition={(state) => state.composer.quote === undefined}>
        <ThreadPrimitive.Suggestion
          prompt={PAGE_SUMMARY_QUESTION}
          send
          render={<Button size="sm" variant="outline" />}
        >
          이 페이지 요약
        </ThreadPrimitive.Suggestion>
      </AuiIf>
    </div>
  )
}
