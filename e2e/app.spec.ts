import { expect, test } from '@playwright/test'

test('앱에서 카운트를 변경하고 새로고침하면 초기 상태로 돌아온다', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Get started', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Count is 0', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Count is 1', exact: true })).toBeVisible()

  await page.reload()

  await expect(page.getByRole('button', { name: 'Count is 0', exact: true })).toBeVisible()
})
