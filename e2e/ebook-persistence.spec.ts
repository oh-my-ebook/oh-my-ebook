/// <reference types="node" />

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium, expect, test } from '@playwright/test'

test('브라우저 프로필을 닫고 같은 프로필로 다시 열어 책과 표지를 복원한다', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'ebook-persistence-'))
  const openContext = () =>
    chromium.launchPersistentContext(profile, {
      baseURL: 'http://127.0.0.1:4173',
      headless: true,
    })
  let context = await openContext()

  try {
    await context.addInitScript(() => {
      navigator.storage.persisted = async () => true
    })
    let page = context.pages()[0] ?? (await context.newPage())
    await page.goto('/library')
    await expect(page.getByRole('button', { name: '책 추가' })).toBeVisible()
    await expect(page.getByRole('article')).toHaveCount(1)
    await page
      .getByLabel('PDF 파일 선택')
      .setInputFiles(resolve('e2e/fixtures/ebook/with-metadata.pdf'))
    await expect(page.getByRole('img', { name: 'The Local Library 표지' })).toBeVisible()
    await context.close()

    context = await openContext()
    page = context.pages()[0] ?? (await context.newPage())
    await page.goto('/library')
    await expect(page.getByText('The Local Library')).toBeVisible()
    await expect(page.getByRole('img', { name: 'The Local Library 표지' })).toBeVisible()
  } finally {
    await context.close()
    await rm(profile, { recursive: true, force: true })
  }
})
