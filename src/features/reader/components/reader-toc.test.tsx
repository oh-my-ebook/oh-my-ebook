import { useRef, useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PdfDocumentHandle, PdfPageInfo } from '../lib/pdf-document'
import { ReaderToc } from './reader-toc'

// jsdom에는 IntersectionObserver가 없다. 이 테스트는 목차 목록 구성·클릭·강조 표시만 확인하므로
// 실제 지연 렌더링 동작(toc-page-thumbnail.test.tsx에서 검증)은 신경 쓰지 않는 무해한 stub만 둔다.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function createPdfDocument(): PdfDocumentHandle {
  return { numPages: 3, getPage: vi.fn(async () => ({ getViewport: vi.fn() })) }
}

function createPages(count: number): PdfPageInfo[] {
  return Array.from({ length: count }, (_, index) => ({
    pageNumber: index + 1,
    width: 800,
    height: 1200,
    rotation: 0,
  }))
}

interface TocHarnessProps {
  currentPage?: number
  document?: PdfDocumentHandle | null
  isWideScreen: boolean
  onPageChange?: (pageNumber: number) => void
  pages?: readonly PdfPageInfo[]
}

function TocHarness({
  currentPage = 1,
  document = createPdfDocument(),
  isWideScreen,
  onPageChange = () => {},
  pages = createPages(3),
}: TocHarnessProps) {
  const [open, setOpen] = useState(false)
  const openButtonRef = useRef<HTMLButtonElement>(null)
  const previousPage = currentPage > 1 ? currentPage - 1 : null
  const nextPage = currentPage < pages.length ? currentPage + 1 : null

  return (
    <>
      <button onClick={() => setOpen((value) => !value)} ref={openButtonRef} type="button">
        목차 열기
      </button>
      <ReaderToc
        currentPage={currentPage}
        document={document}
        isWideScreen={isWideScreen}
        nextPage={nextPage}
        onOpenChange={setOpen}
        onPageChange={onPageChange}
        open={open}
        openButtonRef={openButtonRef}
        pages={pages}
        previousPage={previousPage}
      />
    </>
  )
}

describe('ReaderToc', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('넓은 화면에서는 헤더 없이 본문을 덮지 않는 옆 영역으로 열고 열기 버튼으로 닫는다', async () => {
    const user = userEvent.setup()
    render(<TocHarness isWideScreen />)
    const openButton = screen.getByRole('button', { name: '목차 열기' })

    await user.click(openButton)

    const toc = screen.getByRole('region', { name: '목차' })
    expect(screen.queryByRole('dialog', { name: '목차' })).not.toBeInTheDocument()
    expect(within(toc).queryByRole('heading')).not.toBeInTheDocument()

    await user.click(openButton)

    expect(screen.queryByRole('region', { name: '목차' })).not.toBeInTheDocument()
    expect(openButton).toHaveFocus()
  })

  it('페이지 수만큼 썸네일 버튼을 순서대로 보여준다', async () => {
    const user = userEvent.setup()
    render(<TocHarness isWideScreen pages={createPages(3)} />)

    await user.click(screen.getByRole('button', { name: '목차 열기' }))

    const toc = screen.getByRole('region', { name: '목차' })
    const thumbnails = within(toc).getAllByRole('button', { name: /\d+페이지$/ })
    expect(thumbnails.map((thumbnail) => thumbnail.textContent)).toEqual([
      '1페이지',
      '2페이지',
      '3페이지',
    ])
  })

  it('썸네일을 클릭하면 onPageChange에 페이지 번호를 전달한다', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(<TocHarness isWideScreen onPageChange={onPageChange} pages={createPages(3)} />)

    await user.click(screen.getByRole('button', { name: '목차 열기' }))
    await user.click(screen.getByRole('button', { name: '2페이지' }))

    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('현재 페이지 썸네일에는 aria-current가 있고 다른 페이지에는 없다', async () => {
    const user = userEvent.setup()
    render(<TocHarness currentPage={2} isWideScreen pages={createPages(3)} />)

    await user.click(screen.getByRole('button', { name: '목차 열기' }))

    expect(screen.getByRole('button', { name: '2페이지' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '1페이지' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: '3페이지' })).not.toHaveAttribute('aria-current')
  })

  it('문서를 아직 불러오지 못했으면 목차 내용을 표시하지 않는다', async () => {
    const user = userEvent.setup()
    render(<TocHarness document={null} isWideScreen pages={[]} />)

    await user.click(screen.getByRole('button', { name: '목차 열기' }))

    const toc = screen.getByRole('region', { name: '목차' })
    expect(within(toc).queryByRole('button')).not.toBeInTheDocument()
  })

  it('좁은 화면에서는 왼쪽 Sheet로 열고 같은 목차 목록을 보여준다', async () => {
    const user = userEvent.setup()
    render(<TocHarness isWideScreen={false} pages={createPages(2)} />)

    await user.click(screen.getByRole('button', { name: '목차 열기' }))

    const toc = await screen.findByRole('dialog', { name: '목차' })
    expect(within(toc).getByRole('button', { name: '목차 닫기' })).toBeInTheDocument()
    expect(within(toc).getAllByRole('button', { name: /\d+페이지$/ })).toHaveLength(2)

    // Sheet를 열어 둔 채 테스트를 끝내면 포커스 트랩 등 내부 상태가 다음 테스트로 새어 나가므로 닫는다.
    await user.click(within(toc).getByRole('button', { name: '목차 닫기' }))
    expect(screen.queryByRole('dialog', { name: '목차' })).not.toBeInTheDocument()
  })

  // Sheet는 모달이라 열려 있는 동안 키보드 이벤트가 document까지 전달되지 않으므로,
  // 위아래 화살표로 페이지를 넘기는 동작은 Sheet 자체에서 처리해야 한다.
  it('좁은 화면에서는 목차 안에서 위아래 화살표로 onPageChange를 호출한다', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(
      <TocHarness
        currentPage={2}
        isWideScreen={false}
        onPageChange={onPageChange}
        pages={createPages(3)}
      />,
    )

    await user.click(screen.getByRole('button', { name: '목차 열기' }))
    const toc = await screen.findByRole('dialog', { name: '목차' })
    // Sheet가 여는 순간 포커스를 안으로 옮기는 시점은 타이밍에 좌우되므로, 안에 포커스가 있는
    // 상태를 직접 만들어 위아래 화살표 처리만 검증한다.
    within(toc).getByRole('button', { name: '2페이지' }).focus()

    await user.keyboard('{ArrowDown}')
    expect(onPageChange).toHaveBeenCalledWith(3)

    await user.keyboard('{ArrowUp}')
    expect(onPageChange).toHaveBeenCalledWith(1)
  })
})
