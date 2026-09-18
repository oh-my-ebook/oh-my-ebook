/// <reference lib="dom" />

import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'

test('책장에서 책을 열고 저장된 읽기 위치를 복원한다', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.storage.persisted = async () => true
  })
  await page.goto('/')
  await expect(page.getByText('아직 저장한 책이 없습니다.')).toBeVisible()
  await page
    .getByLabel('PDF 파일 선택')
    .setInputFiles(resolve('e2e/fixtures/ebook/with-metadata.pdf'))

  const progress = await page.getByText(/읽지 않음 · 전체 \d+페이지/).textContent()
  const pageCount = Number(progress?.match(/(\d+)페이지/)?.[1])
  expect(pageCount).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'The Local Library 열기' }).click()
  await expect(page).toHaveURL(/\/books\//)
  await expect(page.getByRole('status', { name: '페이지 위치' })).toHaveText(`1 / ${pageCount}`)

  if (pageCount > 1) {
    await page.getByRole('button', { name: '다음 페이지' }).click()
    await expect(page.getByRole('status', { name: '페이지 위치' })).toHaveText(`2 / ${pageCount}`)
    await page.goBack()
    await expect(page).toHaveURL('/')
    await expect(page.getByText(`2 / ${pageCount}페이지`)).toBeVisible()
    await page.getByRole('button', { name: 'The Local Library 열기' }).click()
    await expect(page.getByRole('status', { name: '페이지 위치' })).toHaveText(`2 / ${pageCount}`)
  }
})
