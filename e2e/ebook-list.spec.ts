/// <reference lib="dom" />

import { expect, test } from '@playwright/test'

test('책장 진입 시 OPFS DB를 초기화하고 새로고침 후 빈 책장을 표시한다', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: '내 책장' })).toBeVisible()
  await expect(page.getByText('아직 저장한 책이 없습니다.')).toBeVisible()
  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        const root = await window.navigator.storage.getDirectory()
        const database = await root.getFileHandle('ebook-library.sqlite3')
        return (await database.getFile()).size
      })
    })
    .toBeGreaterThan(0)

  await page.reload()
  await expect(page.getByText('아직 저장한 책이 없습니다.')).toBeVisible()
})
