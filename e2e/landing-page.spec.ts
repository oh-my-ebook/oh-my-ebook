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
    '외부 업로드 없이,읽던 맥락 그대로.',
  )
  await page.getByRole('link', { name: '먼저 체험해 보기' }).click()
  const paragraph = page
    .getByRole('article', { name: '체험용 본문' })
    .getByText('가상 메모리는 프로세스가 사용하는 주소와 실제 물리 메모리의 주소를 분리한다.', {
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
