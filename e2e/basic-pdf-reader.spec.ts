import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const pdfRequestUrl = '**/samples/basic-reader.pdf'
const textPdfPath = fileURLToPath(new URL('../public/samples/basic-reader.pdf', import.meta.url))
const scannedPdfPath = fileURLToPath(new URL('./fixtures/pdf/scanned.pdf', import.meta.url))

async function openPdf(page: Page, pdfPath: string) {
  await page.route(pdfRequestUrl, (route) =>
    route.fulfill({ contentType: 'application/pdf', path: pdfPath }),
  )
  await page.goto('/sample-reader')
  await expect(page.getByRole('img', { name: 'PDF 1페이지' })).toBeVisible()
  await expect(page.getByRole('status', { name: '페이지 위치' })).toHaveText('1 / 5')
}

async function expectFirstPageToFitReader(page: Page) {
  const metrics = await page.getByRole('main', { name: 'PDF 읽기 영역' }).evaluate((main) => {
    const canvas = main.querySelector('canvas')
    const view = main.ownerDocument.defaultView
    if (!canvas || !view) {
      throw new Error('PDF 첫 페이지 Canvas를 찾지 못했습니다.')
    }

    const mainRect = main.getBoundingClientRect()
    const canvasRect = canvas.getBoundingClientRect()
    const style = view.getComputedStyle(main)
    const contentLeft = mainRect.left + Number.parseFloat(style.paddingLeft)
    const contentRight = mainRect.right - Number.parseFloat(style.paddingRight)
    const contentTop = mainRect.top + Number.parseFloat(style.paddingTop)
    const contentBottom = mainRect.bottom - Number.parseFloat(style.paddingBottom)
    const root = main.ownerDocument.documentElement

    return {
      canvasBottom: canvasRect.bottom,
      canvasHeight: canvasRect.height,
      canvasTop: canvasRect.top,
      contentBottom,
      contentHeight: contentBottom - contentTop,
      contentTop,
      documentHasOverflow:
        root.scrollWidth > root.clientWidth || root.scrollHeight > root.clientHeight,
      leftGap: canvasRect.left - contentLeft,
      mainHasOverflow: main.scrollWidth > main.clientWidth || main.scrollHeight > main.clientHeight,
      rightGap: contentRight - canvasRect.right,
    }
  })

  expect(metrics.canvasTop).toBeGreaterThanOrEqual(metrics.contentTop - 1)
  expect(metrics.canvasBottom).toBeLessThanOrEqual(metrics.contentBottom + 1)
  expect(Math.abs(metrics.canvasHeight - metrics.contentHeight)).toBeLessThanOrEqual(1)
  expect(Math.abs(metrics.leftGap - metrics.rightGap)).toBeLessThanOrEqual(1)
  expect(metrics.documentHasOverflow).toBe(false)
  expect(metrics.mainHasOverflow).toBe(false)
}

test.describe('기본 PDF 리더', () => {
  test('상단 독서 도구에서 테마와 빈 목차 패널을 전환한다', async ({ page }) => {
    await openPdf(page, textPdfPath)

    await page.getByRole('button', { name: '다크 모드로 전환' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)

    await page.getByRole('button', { name: '목차 열기' }).click()
    // 넓은 화면에서는 본문을 덮는 dialog가 아니라 읽기 영역 옆 패널로 열린다.
    const toc = page.getByRole('region', { name: '목차' })
    await expect(toc).toBeVisible()
    await expect(toc.getByRole('link')).toHaveCount(0)
    // 넓은 화면의 목차 패널에는 헤더가 없어 툴바의 목차 버튼으로 닫는다.
    await page.getByRole('button', { name: '목차 닫기' }).click()

    await expect(page.getByRole('button', { name: '목차 열기' })).toBeFocused()
  })

  test('텍스트 PDF 첫 페이지 전체를 화면에 맞춰 표시한다', async ({ page }) => {
    await openPdf(page, textPdfPath)

    await expectFirstPageToFitReader(page)
    await expect(page.getByRole('region', { name: 'PDF 본문' })).toHaveScreenshot(
      'text-pdf-first-page.png',
      { maxDiffPixelRatio: 0.01 },
    )
  })

  test('스캔 PDF 첫 페이지 전체를 화면에 맞춰 표시한다', async ({ page }) => {
    await openPdf(page, scannedPdfPath)

    await expectFirstPageToFitReader(page)
    await expect(page.getByRole('region', { name: 'PDF 본문' })).toHaveScreenshot(
      'scanned-pdf-first-page.png',
      { maxDiffPixelRatio: 0.01 },
    )
  })

  test('확대한 페이지의 모든 영역을 양방향 스크롤로 확인한다', async ({ page }) => {
    await openPdf(page, textPdfPath)

    const zoomIn = page.getByRole('button', { name: '확대' })
    while (await zoomIn.isEnabled()) {
      await zoomIn.click()
    }

    await expect(page.getByRole('status', { name: '현재 확대율' })).toHaveText('300%')

    // 읽기 영역을 감싼 ResizablePanel이 스크롤을 맡는다.
    const viewport = page.getByRole('main', { name: 'PDF 읽기 영역' }).locator('..')
    await expect
      .poll(() =>
        viewport.evaluate((element) => ({
          horizontal: element.scrollWidth > element.clientWidth,
          vertical: element.scrollHeight > element.clientHeight,
        })),
      )
      .toEqual({ horizontal: true, vertical: true })

    const scrollMetrics = await viewport.evaluate((element) => {
      const frame = element.querySelector('[data-slot="pdf-page-frame"]')
      const view = element.ownerDocument.defaultView
      if (!frame || !view) {
        throw new Error('PDF 페이지 프레임을 찾지 못했습니다.')
      }

      const viewportRect = element.getBoundingClientRect()
      const frameRect = frame.getBoundingClientRect()
      const style = view.getComputedStyle(element)
      element.scrollTo({ left: element.scrollWidth, top: element.scrollHeight })
      const endFrameRect = frame.getBoundingClientRect()

      return {
        canScrollHorizontally: element.scrollWidth > element.clientWidth,
        canScrollVertically: element.scrollHeight > element.clientHeight,
        endBottom: endFrameRect.bottom,
        endRight: endFrameRect.right,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        startLeft: frameRect.left,
        startTop: frameRect.top,
        viewportBottom: viewportRect.bottom,
        viewportLeft: viewportRect.left,
        viewportRight: viewportRect.right,
        viewportTop: viewportRect.top,
      }
    })

    expect(scrollMetrics.canScrollHorizontally).toBe(true)
    expect(scrollMetrics.canScrollVertically).toBe(true)
    expect(scrollMetrics.overflowX).toBe('auto')
    expect(scrollMetrics.overflowY).toBe('auto')
    expect(scrollMetrics.startLeft).toBeGreaterThanOrEqual(scrollMetrics.viewportLeft - 1)
    expect(scrollMetrics.startTop).toBeGreaterThanOrEqual(scrollMetrics.viewportTop - 1)
    expect(scrollMetrics.endRight).toBeLessThanOrEqual(scrollMetrics.viewportRight + 1)
    expect(scrollMetrics.endBottom).toBeLessThanOrEqual(scrollMetrics.viewportBottom + 1)
  })

  test('확대해 아래로 스크롤한 뒤 페이지를 넘기면 본문 상단을 표시한다', async ({ page }) => {
    await openPdf(page, textPdfPath)

    const zoomIn = page.getByRole('button', { name: '확대' })
    while (await zoomIn.isEnabled()) {
      await zoomIn.click()
    }
    const scroller = page.getByRole('main', { name: 'PDF 읽기 영역' }).locator('..')
    await scroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)

    await page.getByRole('button', { name: '다음 페이지' }).click()

    await expect(page.getByRole('status', { name: '페이지 위치' })).toHaveText('2 / 5')
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(0)
  })

  test('PDF 요청이 실패하면 안내하고 다시 불러온다', async ({ page }) => {
    await page.route(pdfRequestUrl, (route) =>
      route.fulfill({ contentType: 'application/pdf', path: textPdfPath }),
    )
    await page.route(
      pdfRequestUrl,
      (route) => route.fulfill({ contentType: 'application/pdf', status: 503 }),
      { times: 1 },
    )

    await page.goto('/sample-reader')

    await expect(page.getByRole('alert')).toContainText('PDF를 불러오지 못했습니다.')
    await page.getByRole('button', { name: 'PDF 다시 불러오기' }).click()

    await expect(page.getByRole('img', { name: 'PDF 1페이지' })).toBeVisible()
    await expect(page.getByRole('status', { name: '페이지 위치' })).toHaveText('1 / 5')
  })
})
