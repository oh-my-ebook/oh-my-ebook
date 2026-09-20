import { useEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'

export type PdfSelectionAction = 'attach' | 'explain'

export interface PdfTextSelection {
  pageNumber: number
  text: string
}

interface PdfSelectionToolbarProps {
  containerRef: RefObject<HTMLElement | null>
  onAction(selectionAction: PdfSelectionAction, selection: PdfTextSelection): void
}

interface SelectedPdfText extends PdfTextSelection {
  rect: DOMRect
}

function getElement(node: Node | null) {
  return node instanceof Element ? node : node?.parentElement
}

function getSelectedText(range: Range, pageLayer: Element) {
  return [...pageLayer.querySelectorAll('[data-slot="pdf-ocr-line"]')]
    .filter((line) => range.intersectsNode(line))
    .map((line) => {
      const lineRange = document.createRange()
      lineRange.selectNodeContents(line)
      if (line.contains(range.startContainer)) {
        lineRange.setStart(range.startContainer, range.startOffset)
      }
      if (line.contains(range.endContainer)) {
        lineRange.setEnd(range.endContainer, range.endOffset)
      }
      return lineRange.toString()
    })
    .join('\n')
    .trim()
}

export function PdfSelectionToolbar({ containerRef, onAction }: PdfSelectionToolbarProps) {
  const [selectedText, setSelectedText] = useState<SelectedPdfText | null>(null)

  useEffect(() => {
    function updateSelection() {
      requestAnimationFrame(() => {
        const container = containerRef.current
        const selection = window.getSelection()
        if (!container || !selection || selection.isCollapsed || selection.rangeCount === 0) {
          setSelectedText(null)
          return
        }

        const startPage = getElement(selection.anchorNode)?.closest('[data-pdf-page-number]')
        const endPage = getElement(selection.focusNode)?.closest('[data-pdf-page-number]')
        if (!startPage || startPage !== endPage || !container.contains(startPage)) {
          setSelectedText(null)
          return
        }

        const pageNumber = Number(startPage.getAttribute('data-pdf-page-number'))
        const range = selection.getRangeAt(0)
        const text = getSelectedText(range, startPage)
        if (!Number.isSafeInteger(pageNumber) || !text) {
          setSelectedText(null)
          return
        }

        setSelectedText({ pageNumber, rect: range.getBoundingClientRect(), text })
      })
    }

    function clearCollapsedSelection() {
      if (window.getSelection()?.isCollapsed) setSelectedText(null)
    }

    function clearSelectionToolbar() {
      setSelectedText(null)
    }

    document.addEventListener('mouseup', updateSelection)
    document.addEventListener('keyup', updateSelection)
    document.addEventListener('selectionchange', clearCollapsedSelection)
    document.addEventListener('scroll', clearSelectionToolbar, true)
    return () => {
      document.removeEventListener('mouseup', updateSelection)
      document.removeEventListener('keyup', updateSelection)
      document.removeEventListener('selectionchange', clearCollapsedSelection)
      document.removeEventListener('scroll', clearSelectionToolbar, true)
    }
  }, [containerRef])

  if (!selectedText) return null

  function handleAction(selectionAction: PdfSelectionAction) {
    if (!selectedText) return
    onAction(selectionAction, { pageNumber: selectedText.pageNumber, text: selectedText.text })
    window.getSelection()?.removeAllRanges()
    setSelectedText(null)
  }

  return createPortal(
    <div
      aria-label="선택 문장 동작"
      className="fixed flex gap-0.5 rounded-lg border bg-popover p-0.5 shadow-md"
      onMouseDown={(event) => event.preventDefault()}
      role="toolbar"
      style={{
        left: selectedText.rect.left + selectedText.rect.width / 2,
        top: selectedText.rect.top - 8,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <Button onClick={() => handleAction('attach')} size="xs" variant="ghost">
        채팅에 추가
      </Button>
      <Button onClick={() => handleAction('explain')} size="xs" variant="ghost">
        자세히 설명
      </Button>
    </div>,
    document.body,
  )
}
