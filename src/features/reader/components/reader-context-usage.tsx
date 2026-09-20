import { useAuiState } from '@assistant-ui/react'
import { ChevronDownIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import {
  AUTO_COMPACT_RATIO,
  CONTEXT_WINDOW,
  RESPONSE_TOKENS,
  SAFETY_TOKENS,
  filterContextMessages,
  getContextText,
  prepareContext,
  toContextMessages,
} from '../lib/web-llm/webllm-context'
import { useWebLlmModelStore } from '../lib/web-llm/webllm-model'

interface ReaderContextUsageProps {
  system: string
  excludedIds: ReadonlySet<string>
  onCompact(ids: string[]): void
}

const format = (tokens: number) => tokens.toLocaleString('ko-KR')

export function ReaderContextUsage({ system, excludedIds, onCompact }: ReaderContextUsageProps) {
  const messages = useAuiState((state) => state.thread.messages)
  const isRunning = useAuiState((state) => state.thread.isRunning)
  const text = useAuiState((state) => state.composer.text)
  const quote = useAuiState((state) => state.composer.quote)
  const count = useWebLlmModelStore((state) => state.countTokens)
  const active = filterContextMessages(messages, excludedIds)
  const history = toContextMessages(active)
  if (text.trim() || quote) {
    history.push({
      role: 'user',
      content: getContextText({
        role: 'user',
        content: [{ type: 'text', text }],
        metadata: { custom: { quote } },
      }),
    })
  }
  const budget = count ? prepareContext(system, history, count) : undefined
  const previous = active.slice(
    0,
    Math.max(
      0,
      active.findLastIndex((message) => message.role === 'user'),
    ),
  )
  const removed = messages.length - active.length + (budget?.removedMessages ?? 0)
  const percent = budget ? Math.round((budget.totalTokens / CONTEXT_WINDOW) * 100) : 0
  const segments = budget
    ? ([
        ['시스템 지시·형식', budget.systemTokens],
        ['책 정보', budget.metadataTokens],
        ['페이지 본문', budget.pageTokens],
        ['대화·질문·인용', budget.conversationTokens],
        ['답변 예약', RESPONSE_TOKENS],
        ['안전 여유', SAFETY_TOKENS],
      ] as const)
    : []

  return (
    <Collapsible className="shrink-0">
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            컨텍스트 윈도우
            <CollapsibleTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="컨텍스트 상세" />}
            >
              <ChevronDownIcon />
            </CollapsibleTrigger>
          </CardTitle>
          <CardDescription>
            {budget
              ? `${format(budget.totalTokens)} / ${format(CONTEXT_WINDOW)} (${percent}%) · 예상`
              : '모델 준비 후 토큰 수를 표시합니다'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {budget && (
            <Progress
              value={Math.min(budget.totalTokens, CONTEXT_WINDOW)}
              max={CONTEXT_WINDOW}
              aria-valuetext={`${format(budget.totalTokens)} / ${format(CONTEXT_WINDOW)} 토큰, ${percent}%`}
            >
              <ProgressLabel className="sr-only">컨텍스트 윈도우</ProgressLabel>
            </Progress>
          )}
          <CardDescription>
            {AUTO_COMPACT_RATIO * 100}%부터 전송 시 이전 대화를 자동 정리합니다
          </CardDescription>
          {budget && (
            <div role="status" aria-label="컨텍스트 정리 안내">
              {removed > 0 && <p>이전 메시지 {removed}개를 모델 입력에서 제외합니다.</p>}
              {budget.truncatedSources.length > 0 && (
                <p>{budget.truncatedSources.join('·')} 일부를 생략합니다.</p>
              )}
              {budget.error && <p>{budget.error}</p>}
            </div>
          )}
          <CollapsibleContent className="flex max-h-40 flex-col gap-3 overflow-y-auto">
            {segments.map(([label, tokens]) => (
              <Progress key={label} value={Math.min(tokens, CONTEXT_WINDOW)} max={CONTEXT_WINDOW}>
                <ProgressLabel>{label}</ProgressLabel>
                <ProgressValue>{() => format(tokens)}</ProgressValue>
              </Progress>
            ))}
            <CardDescription>
              현재 페이지와 입력 중인 질문·인용을 포함한 다음 요청의 예상치입니다. 답변 예약과 안전
              여유를 포함하며 누적 사용량이 아닙니다. 정리된 대화는 화면에 남지만 모델은 읽지
              않습니다. 최근 질문·답변은 유지하며 이전 대화를 요약하지는 않습니다.
            </CardDescription>
          </CollapsibleContent>
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            variant="link"
            size="sm"
            disabled={!count || isRunning || previous.length === 0}
            onClick={() => onCompact(previous.map((message) => message.id))}
          >
            이전 대화 정리
          </Button>
        </CardFooter>
      </Card>
    </Collapsible>
  )
}
