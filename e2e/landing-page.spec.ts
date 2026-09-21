/// <reference lib="dom" />

import { expect, test } from '@playwright/test'

test('모델을 다운로드하지 않고 체험한 뒤 책장에 진입한다', async ({ page }) => {
  const modelRequests: string[] = []
  page.on('request', (request) => {
    if (/\.(wasm|onnx|tar)(\?|$)|ebook-db\.worker|huggingface/.test(request.url())) {
      modelRequests.push(request.url())
    }
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    '책 밖으로 나가지 않고,읽던 맥락 그대로.',
  )
  await page.getByRole('link', { name: '먼저 체험해 보기' }).click()
  const paragraph = page
    .getByRole('article', { name: '체험용 본문' })
    .getByText('가상 메모리는 프로세스가 사용하는 주소와 실제 물리 메모리의 주소를 분리합니다.', {
      exact: true,
    })
  await paragraph.click({ clickCount: 3 })
  await page.getByRole('button', { name: '채팅에 추가' }).click()
  await expect(page.getByLabel('첨부한 인용문')).toContainText('가상 메모리는')
  await expect(page.getByRole('log')).not.toBeVisible()
  await expect(page.getByRole('textbox', { name: '질문 입력' })).toHaveValue('')
  await page.getByRole('button', { name: '인용 삭제' }).click()
  await paragraph.click({ clickCount: 3 })
  await page.getByRole('button', { name: '자세히 설명' }).click()
  await expect(page.getByRole('region', { name: '읽기 체험' }).getByRole('log')).toContainText(
    '연속된 주소 공간',
  )
  expect(modelRequests).toEqual([])
  await page.getByRole('link', { name: '책장 열기', exact: true }).click()
  await expect(page).toHaveURL('/library')
  await expect(page.getByRole('heading', { name: '내 서재' })).toBeVisible()
})

test('좁은 화면과 동작 감소 환경에서 키보드로 표지를 바꾸고 체험한다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: '다음 책' }).focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('region', { name: '직접 만든 책 표지' }).getByRole('status'),
  ).toContainText('그림으로 배우는 자료구조')
  await page.getByRole('button', { name: '이 페이지 요약' }).click()
  await expect(page.getByRole('region', { name: '읽기 체험' }).getByRole('log')).toContainText(
    '페이지 테이블',
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  await expect(page.getByText(/All rights reserved/)).toBeVisible()
})

test('개인정보 영역의 원형 장식이 위아래 구분선과 겹치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')

  const sectionBox = await page.locator('.landing-private').boundingBox()
  const orbitBox = await page.locator('.landing-orbit-outer').boundingBox()

  if (!sectionBox || !orbitBox) {
    throw new Error('개인정보 영역이나 원형 장식의 위치를 확인할 수 없습니다.')
  }

  expect(orbitBox.y).toBeGreaterThan(sectionBox.y)
  expect(orbitBox.y + orbitBox.height).toBeLessThan(sectionBox.y + sectionBox.height)

  const orbitStyles = await page.locator('.landing-orbit').evaluateAll((nodes) =>
    nodes.map((node) => {
      const animation = node.getAnimations()[0]
      animation.currentTime = 1500
      animation.pause()
      const style = getComputedStyle(node)
      return {
        animationDelay: style.animationDelay,
        animationDuration: style.animationDuration,
        borderColor: style.borderTopColor,
        opacity: Number(style.opacity),
      }
    }),
  )
  const expectedBorderColor = await page.evaluate(() => {
    const probe = document.createElement('i')
    probe.style.color = 'color-mix(in srgb, var(--muted-foreground) 14%, var(--border))'
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  })

  expect(orbitStyles.map(({ animationDelay }) => animationDelay)).toEqual(['0s', '0s'])
  expect(orbitStyles.map(({ animationDuration }) => animationDuration)).toEqual(['6s', '6s'])
  expect(orbitStyles.map(({ borderColor }) => borderColor)).toEqual([
    expectedBorderColor,
    expectedBorderColor,
  ])
  expect(orbitStyles.every(({ opacity }) => opacity >= 0.6)).toBe(true)
})

test('문장 선택과 읽기 순서, 로컬 처리를 움직임으로 설명한다', async ({ page }) => {
  await page.goto('/')

  const animatedElements = [
    page.locator('.landing-scan-illustration mark'),
    page.locator('.landing-order-column i').first(),
    page.locator('.landing-order-pointer'),
    page.locator('.landing-orbit-inner'),
  ]
  const animationNames = await Promise.all(
    animatedElements.map((element) =>
      element.evaluate((node) => getComputedStyle(node).animationName),
    ),
  )

  expect(animationNames).toEqual([
    'landing-text-selection',
    'landing-line-selection',
    'landing-reading-pointer',
    'landing-private-ripple',
  ])

  const readingColumns = page.locator('.landing-order-column')
  await expect(readingColumns.first().locator('i')).toHaveCount(8)
  const columnDelays = await Promise.all(
    [0, 1, 2, 3].map((index) =>
      readingColumns
        .nth(index)
        .locator('i')
        .first()
        .evaluate((node) => getComputedStyle(node).animationDelay),
    ),
  )
  expect(columnDelays).toEqual(['0s', '1.25s', '2.5s', '3.75s'])

  const getFirstColumnColorsAt = (currentTime: number) =>
    readingColumns
      .first()
      .locator('i')
      .evaluateAll((nodes, time) => {
        nodes.forEach((node) => {
          const animation = node.getAnimations()[0]
          animation.currentTime = time
          animation.pause()
        })

        const ocrProbe = document.createElement('i')
        const borderProbe = document.createElement('i')
        ocrProbe.style.background = 'var(--ocr-highlight)'
        borderProbe.style.background = 'var(--border)'
        document.body.append(ocrProbe, borderProbe)
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        const toPixel = (color: string) => {
          if (!context) throw new Error('색상 비교용 canvas를 만들 수 없습니다.')
          context.fillStyle = color
          context.fillRect(0, 0, 1, 1)
          return [...context.getImageData(0, 0, 1, 1).data]
        }
        const colors = {
          border: toPixel(getComputedStyle(borderProbe).backgroundColor),
          lines: nodes.map((node) => toPixel(getComputedStyle(node).backgroundColor)),
          ocr: toPixel(getComputedStyle(ocrProbe).backgroundColor),
        }
        ocrProbe.remove()
        borderProbe.remove()
        return colors
      }, currentTime)

  const fiveLinesSelected = await getFirstColumnColorsAt(800)
  expect(fiveLinesSelected.lines).toEqual([
    fiveLinesSelected.ocr,
    fiveLinesSelected.ocr,
    fiveLinesSelected.ocr,
    fiveLinesSelected.ocr,
    fiveLinesSelected.ocr,
    fiveLinesSelected.border,
    fiveLinesSelected.border,
    fiveLinesSelected.border,
  ])

  const allLinesSelected = await getFirstColumnColorsAt(1150)
  expect(allLinesSelected.lines).toEqual([
    allLinesSelected.ocr,
    allLinesSelected.ocr,
    allLinesSelected.ocr,
    allLinesSelected.ocr,
    allLinesSelected.ocr,
    allLinesSelected.ocr,
    allLinesSelected.ocr,
    allLinesSelected.ocr,
  ])

  const selectionCleared = await getFirstColumnColorsAt(1300)
  expect(selectionCleared.lines).toEqual([
    selectionCleared.border,
    selectionCleared.border,
    selectionCleared.border,
    selectionCleared.border,
    selectionCleared.border,
    selectionCleared.border,
    selectionCleared.border,
    selectionCleared.border,
  ])

  const pointer = page.locator('.landing-order-pointer')
  await pointer.evaluate((node) => {
    const animation = node.getAnimations()[0]
    animation.currentTime = 1150
    animation.pause()
  })
  const pointerBox = await pointer.boundingBox()
  const lastLineBox = await readingColumns.first().locator('i').last().boundingBox()
  if (!pointerBox || !lastLineBox) throw new Error('커서와 마지막 줄의 위치를 확인할 수 없습니다.')
  expect(Math.abs(pointerBox.y - lastLineBox.y)).toBeLessThan(12)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const reducedDurations = await Promise.all(
    animatedElements.map((element) =>
      element.evaluate((node) => getComputedStyle(node).animationDuration),
    ),
  )

  expect(reducedDurations).toEqual(['1e-05s', '1e-05s', '1e-05s', '1e-05s'])
})

test('기능 일러스트를 4대 3 비율로 표시하고 내부 그림을 가운데 둔다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')

  const scanBox = await page.locator('.landing-scan-illustration').boundingBox()
  const scanPageWidth = await page
    .locator('.landing-scan-illustration > div')
    .evaluate((node) => Number.parseFloat(getComputedStyle(node).width))
  const orderBox = await page.locator('.landing-order-illustration').boundingBox()
  const orderSpread = await page.locator('.landing-order-spread').boundingBox()

  if (!scanBox || !orderBox || !orderSpread) {
    throw new Error('기능 일러스트의 위치를 확인할 수 없습니다.')
  }

  expect(scanBox.width / scanBox.height).toBeCloseTo(4 / 3, 2)
  expect(orderBox.width / orderBox.height).toBeCloseTo(4 / 3, 2)
  expect(scanPageWidth).toBeGreaterThanOrEqual(250)
  expect(orderSpread.width / orderBox.width).toBeGreaterThan(0.8)
  expect(orderSpread.x + orderSpread.width / 2).toBeCloseTo(orderBox.x + orderBox.width / 2, 0)
})

test('예시 리더의 너비를 본문과 함께 읽기 패널에 맞게 제한한다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')

  const demoBox = await page.locator('.landing-demo').boundingBox()
  const footerBox = await page.locator('.landing-demo-footer').boundingBox()
  if (!demoBox || !footerBox) throw new Error('예시 리더의 크기를 확인할 수 없습니다.')

  expect(demoBox.width).toBeLessThanOrEqual(960)
  expect(footerBox.width).toBeCloseTo(demoBox.width, 0)
  expect(footerBox.x).toBeCloseTo(demoBox.x, 0)
})
