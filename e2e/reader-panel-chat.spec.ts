import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'

const PANEL_OPEN_LABEL = '보조 패널 열기'
const PANEL_TITLE = '보조 패널'
const MESSAGE_INPUT_LABEL = 'Message input'
const SEND_BUTTON_LABEL = 'Send message'
const MOCK_RESPONSE_TEXT =
  '질문을 확인했어요. 지금은 Mock 응답이라 실제 AI 답변은 아직 연결되지 않았어요.'

async function hasHorizontalOverflow(page: import('@playwright/test').Page) {
  return page.locator('html').evaluate((root) => root.scrollWidth > root.clientWidth)
}

async function openReader(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    navigator.storage.persisted = async () => true
  })
  await page.goto('/')
  await expect(page.getByText('아직 저장한 책이 없습니다.')).toBeVisible()
  await page
    .getByLabel('PDF 파일 선택')
    .setInputFiles(resolve('e2e/fixtures/ebook/with-metadata.pdf'))
  await page.getByRole('button', { name: '책 열기' }).click()
  await expect(page).toHaveURL(/\/books\//)
}

test.describe('보조 패널 채팅', () => {
  test('넓은 화면에서 질문을 보내면 스트리밍 응답을 받는다', async ({ page }) => {
    await openReader(page)
    await page.getByRole('button', { name: PANEL_OPEN_LABEL }).click()
    await expect(page.getByRole('region', { name: PANEL_TITLE })).toBeVisible()

    const input = page.getByRole('textbox', { name: MESSAGE_INPUT_LABEL })
    await input.fill('이 페이지 요약해줘')
    await input.press('Enter')

    await expect(page.getByText('이 페이지 요약해줘')).toBeVisible()
    await expect(page.getByText(MOCK_RESPONSE_TEXT)).toBeVisible()
    await expect(page.getByRole('button', { name: SEND_BUTTON_LABEL })).toBeVisible()
  })

  test.describe('좁은 화면(320px)', () => {
    test.use({ viewport: { width: 320, height: 700 } })

    test('Sheet에서 질문을 보내고 조작부가 화면 밖으로 잘리지 않는다', async ({ page }) => {
      await openReader(page)
      await page.getByRole('button', { name: PANEL_OPEN_LABEL }).click()
      await expect(page.getByRole('dialog', { name: PANEL_TITLE })).toBeVisible()

      const input = page.getByRole('textbox', { name: MESSAGE_INPUT_LABEL })
      await input.fill('이 페이지 요약해줘')
      await input.press('Enter')

      await expect(page.getByText(MOCK_RESPONSE_TEXT)).toBeVisible()

      const viewportSize = page.viewportSize()
      const inputBox = await input.boundingBox()
      const sendButtonBox = await page
        .getByRole('button', { name: SEND_BUTTON_LABEL })
        .boundingBox()
      if (!viewportSize || !inputBox || !sendButtonBox) {
        throw new Error('채팅 조작부의 위치를 확인하지 못했습니다.')
      }

      expect(inputBox.x).toBeGreaterThanOrEqual(0)
      expect(inputBox.x + inputBox.width).toBeLessThanOrEqual(viewportSize.width)
      expect(inputBox.y).toBeGreaterThanOrEqual(0)
      expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(viewportSize.height)
      expect(sendButtonBox.x).toBeGreaterThanOrEqual(0)
      expect(sendButtonBox.x + sendButtonBox.width).toBeLessThanOrEqual(viewportSize.width)
      expect(sendButtonBox.y).toBeGreaterThanOrEqual(0)
      expect(sendButtonBox.y + sendButtonBox.height).toBeLessThanOrEqual(viewportSize.height)
      expect(await hasHorizontalOverflow(page)).toBe(false)
    })
  })
})
