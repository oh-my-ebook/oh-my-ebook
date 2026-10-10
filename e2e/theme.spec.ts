/// <reference lib="dom" />

import { expect, test } from '@playwright/test'
import { createPromiseController } from '../src/test/promise-controller.ts'

test('React 로딩 전부터 저장된 테마를 적용하고 로딩 후에도 유지한다', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
  const loading = createPromiseController<void>()
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() === 'script') await loading.promise
    await route.continue()
  })

  try {
    await page.goto('/', { waitUntil: 'commit' })
    await expect(page.locator('#root')).toBeAttached()
    await expect(page.locator('#root')).toBeEmpty()
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
    await expect
      .poll(() =>
        page
          .locator('body')
          .evaluate((body) => getComputedStyle(body).getPropertyValue('--background').trim()),
      )
      .not.toBe('')
    const background = await page.locator('body').evaluate((body) => {
      const probe = document.createElement('div')
      probe.style.backgroundColor = 'var(--background)'
      body.append(probe)
      const color = getComputedStyle(probe).backgroundColor
      probe.remove()
      return color
    })
    await expect(page.locator('body')).toHaveCSS('background-color', background)
  } finally {
    loading.resolve()
  }

  await page.waitForLoadState('load')
  await expect(page.getByRole('button', { name: '라이트 모드로 전환' })).toBeVisible()
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
})

test('저장된 선택이 없으면 시스템 테마로 시작하고 직접 전환한 선택을 우선한다', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '라이트 모드로 전환' })).toBeVisible()
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')

  await page.emulateMedia({ colorScheme: 'light' })
  await page.reload()
  await expect(page.getByRole('button', { name: '다크 모드로 전환' })).toBeVisible()
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')

  await page.getByRole('button', { name: '다크 모드로 전환' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: '라이트 모드로 전환' })).toBeVisible()
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
  await page.getByRole('button', { name: '라이트 모드로 전환' }).click()
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.reload()
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')
})

test('리더에서 선택한 테마를 서재에서도 전환할 수 있다', async ({ page }) => {
  await page.goto('/sample-reader')
  await page.getByRole('button', { name: '다크 모드로 전환' }).click()
  await page.getByRole('button', { name: '책장으로 돌아가기' }).click()

  const navigation = page.getByRole('navigation', { name: '주 탐색' })
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
  await navigation.getByRole('button', { name: '라이트 모드로 전환' }).click()
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')

  await page.setViewportSize({ width: 320, height: 720 })
  const toggle = navigation.getByRole('button', { name: '다크 모드로 전환' })
  await expect(toggle).toBeInViewport()
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark')
})
