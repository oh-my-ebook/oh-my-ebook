import { expect, test } from '@playwright/test'

test('첫 진입과 새로고침 후 PDF 첫 페이지를 표시한다', async ({ page }) => {
  await page.goto('/sample-reader')

  await expect(page.getByRole('heading', { name: '기본 PDF 리더 샘플' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'PDF 1페이지' })).toBeVisible()
  await expect(page.getByRole('status', { name: '페이지 위치' })).toHaveText('1 / 5')

  await page.reload()

  await expect(page.getByRole('img', { name: 'PDF 1페이지' })).toBeVisible()
  await expect(page.getByRole('status', { name: '페이지 위치' })).toHaveText('1 / 5')
})
