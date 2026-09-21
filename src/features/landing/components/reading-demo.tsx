import { useRef } from 'react'
import { AssistantRuntimeProvider, useAui, useLocalRuntime } from '@assistant-ui/react'
import { ArrowUpRight, BookOpen, PanelRight } from 'lucide-react'
import { Link } from 'react-router'
import { Thread, type ThreadComponents } from '@/components/assistant-ui/elements/thread.aui'
import { PdfSelectionToolbar } from '@/components/pdf-selection-toolbar'
import { ReaderChatWelcome } from '@/components/reader-chat-welcome'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  createMockChatModelAdapter,
  type MockResponder,
} from '@/features/reader/lib/mock-chat-adapter'
import { decodeQuoteTexts, encodeQuoteTexts } from '@/lib/quote'

const threadComponents: ThreadComponents = { Welcome: ReaderChatWelcome }
const explainQuestion = '선택한 문장을 현재 페이지와 책의 맥락에 맞춰 자세히 설명해 주세요.'
const demoRespond: MockResponder = async function* (question, _context, abortSignal) {
  const chunks =
    question === '이 페이지에 대해 요약해줘'
      ? [
          '프로세스는 자신만의 가상 주소 공간을 사용합니다.',
          ' 가상 주소와 물리 주소는 서로 다르며,',
          ' 페이지 테이블이 두 주소를 연결합니다.',
          ' 이 구조 덕분에 프로그램은 물리 메모리가 어디에 배치됐는지 직접 관리할 필요가 없습니다.',
        ]
      : question === explainQuestion
        ? [
            '프로그램에는 연속된 주소 공간이 보이지만,',
            ' 실제 데이터는 RAM의 서로 다른 위치에 놓일 수 있다는 뜻이에요.',
            ' 페이지 테이블이 둘 사이의 연결표 역할을 합니다.',
            ' 가상 주소를 실제 데이터가 있는 물리 주소로 바꿔 주는 거예요.',
          ]
        : [
            '이 체험은 페이지 요약과 가상 메모리 설명을 미리 작성한 답변으로 보여 드립니다.',
            ' 자유로운 질문은 실제 PDF 리더에서 모델을 내려받은 뒤 이용해 주세요.',
          ]

  for (const chunk of chunks) {
    await new Promise((resolve) => setTimeout(resolve, 220))
    if (abortSignal.aborted) return
    yield chunk
  }
}
const demoModel = createMockChatModelAdapter(demoRespond)

export function ReadingDemo() {
  const runtime = useLocalRuntime(demoModel)
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ReadingDemoContent />
    </AssistantRuntimeProvider>
  )
}

function ReadingDemoContent() {
  const pageRef = useRef<HTMLElement>(null)
  const assistant = useAui()

  return (
    <section id="try" className="landing-section" aria-label="읽기 체험">
      <div className="landing-section-heading">
        <p className="landing-eyebrow">읽기 · 질문 · 이해</p>
        <h2>어려운 개념을 만났을 때, 그 자리에서.</h2>
        <p>본문을 드래그해 질문하거나, 함께 읽기에서 ‘이 페이지 요약’을 눌러 보세요.</p>
      </div>
      <div className="landing-demo">
        <div className="landing-demo-toolbar">
          <span>
            <BookOpen size={16} aria-hidden="true" /> 운영체제의 기초
          </span>
          <Badge variant="outline">미리 작성한 답변으로 체험</Badge>
        </div>
        <Separator />
        <div className="landing-demo-columns">
          <article
            ref={pageRef}
            data-pdf-page-number="1"
            className="landing-demo-page"
            aria-label="체험용 본문"
          >
            <p className="landing-eyebrow">03 / 메모리 관리</p>
            <h3>
              가상 메모리는
              <br />왜 필요할까?
            </h3>
            <p data-slot="pdf-ocr-line">
              여러 프로그램이 동시에 실행될 때, 각 프로그램은 자신만의 주소 공간을 사용합니다.
              프로그램이 보는 주소가 곧 RAM의 실제 위치를 뜻하는 것은 아닙니다.
            </p>
            <p data-slot="pdf-ocr-line">
              가상 메모리는 프로세스가 사용하는 주소와 실제 물리 메모리의 주소를 분리합니다.
            </p>
            <p data-slot="pdf-ocr-line">
              가상 주소는 페이지 테이블을 통해 물리 주소에 연결됩니다. 프로그램은 물리 메모리의
              배치를 직접 다루지 않고도 메모리에 접근할 수 있습니다.
            </p>
            <p data-slot="pdf-ocr-line">
              필요한 페이지가 메모리에 없으면 운영체제가 저장 장치에서 불러옵니다. 당장 쓰지 않는
              페이지는 잠시 내보내 한정된 RAM을 여러 프로그램이 나누어 쓰게 합니다.
            </p>
            <p className="landing-page-number">
              01 <span> / </span> 03
            </p>
          </article>
          <PdfSelectionToolbar
            containerRef={pageRef}
            onAction={(action, selection) => {
              const composer = assistant.thread.composer()
              const currentQuote = composer.getState().quote
              const quotes = currentQuote ? decodeQuoteTexts(currentQuote.text) : []
              composer.setQuote({
                messageId: 'pdf-page-1',
                text: encodeQuoteTexts([...quotes, selection.text]),
              })
              if (action === 'explain') {
                composer.setText(explainQuestion)
                composer.send()
              }
            }}
          />
          <aside className="landing-demo-assistant" aria-label="함께 읽기 체험">
            <div className="landing-demo-assistant-heading">
              <PanelRight size={18} aria-hidden="true" />
              <h3>함께 읽기</h3>
            </div>
            <div className="min-h-0 flex-1">
              <Thread components={threadComponents} autoFocus={false} />
            </div>
          </aside>
        </div>
      </div>
      <div className="landing-demo-footer">
        <p>직접 쓴 학습 예제입니다. 실제 AI 답변은 리더에서 모델을 내려받은 후 사용할 수 있어요.</p>
        <Link className={buttonVariants({ variant: 'link' })} to="/sample-reader">
          실제 PDF 리더 열기
          <ArrowUpRight data-icon="inline-end" />
        </Link>
      </div>
    </section>
  )
}
