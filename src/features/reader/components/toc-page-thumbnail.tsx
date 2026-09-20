import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { PdfDocumentHandle, PdfPageInfo } from '../lib/pdf-document'
import { isRenderablePdfPage, renderPdfPageToCanvas } from '../lib/pdf-page-render'

const THUMBNAIL_WIDTH = 64

interface TocPageThumbnailProps {
  document: PdfDocumentHandle
  isCurrent: boolean
  onSelect(pageNumber: number): void
  page: PdfPageInfo
}

export function TocPageThumbnail({ document, isCurrent, onSelect, page }: TocPageThumbnailProps) {
  const rowRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [isRendered, setIsRendered] = useState(false)

  // 현재 페이지가 목차 스크롤 범위 밖에 있으면, 보이는 범위의 가장자리에 걸치도록 스스로를 스크롤한다.
  // 화살표를 눌렀을 때 스크롤이 순간이동하듯 튀지 않도록 부드럽게 움직인다.
  useEffect(() => {
    if (isCurrent) {
      rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isCurrent])

  // 목차를 열자마자 모든 페이지를 한꺼번에 그리지 않도록, 스크롤로 실제 보일 때만 렌더링한다.
  useEffect(() => {
    const container = containerRef.current
    if (!container || isVisible) {
      return
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setIsVisible(true)
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [isVisible])

  useEffect(() => {
    const canvas = containerRef.current?.querySelector('canvas')
    if (!isVisible || !canvas) {
      return
    }

    const controller = new AbortController()
    const renderThumbnail = async () => {
      const pdfPage = await document.getPage(page.pageNumber)
      controller.signal.throwIfAborted()
      if (!isRenderablePdfPage(pdfPage)) {
        return
      }
      await renderPdfPageToCanvas(pdfPage, canvas, THUMBNAIL_WIDTH / page.width, controller.signal)
      if (!controller.signal.aborted) {
        setIsRendered(true)
      }
    }

    renderThumbnail().catch(() => undefined)
    return () => controller.abort()
  }, [document, isVisible, page])

  return (
    <Button
      aria-current={isCurrent ? 'page' : undefined}
      className="h-auto w-full justify-start gap-2 px-2 py-1.5 aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
      data-page-number={page.pageNumber}
      onClick={() => onSelect(page.pageNumber)}
      ref={rowRef}
      variant="ghost"
    >
      <div
        className="relative shrink-0 overflow-hidden rounded-sm border"
        ref={containerRef}
        style={{ width: THUMBNAIL_WIDTH, aspectRatio: `${page.width} / ${page.height}` }}
      >
        <canvas
          aria-label={`${page.pageNumber}페이지 썸네일`}
          className="h-full w-full"
          hidden={!isRendered}
          role="img"
        />
        {!isRendered && <Skeleton className="absolute inset-0 h-full w-full" />}
      </div>
      <span className="text-sm">{page.pageNumber}페이지</span>
    </Button>
  )
}
