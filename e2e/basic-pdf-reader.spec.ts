import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const pdfRequestUrl = '**/samples/basic-reader.pdf'
const textPdfPath = fileURLToPath(new URL('../public/samples/basic-reader.pdf', import.meta.url))
const scannedPdfPath = fileURLToPath(new URL('./fixtures/pdf/scanned.pdf', import.meta.url))

async function openPdf(page: Page, pdfPath: string) {
  await page.route(pdfRequestUrl, (route) =>
    route.fulfill({ contentType: 'application/pdf', path: pdfPath }),
  )
  await page.goto('/')
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

  test('PDF 요청이 실패하면 안내하고 다시 불러온다', async ({ page }) => {
    await page.route(pdfRequestUrl, (route) =>
      route.fulfill({ contentType: 'application/pdf', path: textPdfPath }),
    )
    await page.route(
      pdfRequestUrl,
      (route) => route.fulfill({ contentType: 'application/pdf', status: 503 }),
      { times: 1 },
    )

    await page.goto('/')

    await expect(page.getByRole('alert')).toContainText('PDF를 불러오지 못했습니다.')
    await page.getByRole('button', { name: 'PDF 다시 불러오기' }).click()

    await expect(page.getByRole('img', { name: 'PDF 1페이지' })).toBeVisible()
    await expect(page.getByRole('status', { name: '페이지 위치' })).toHaveText('1 / 5')
  })
})
