/// <reference lib="dom" />

import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'

test('PDF를 추가하고 내용 중복을 막으며 새로고침 후 표지와 책 정보를 복원한다', async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.storage.persisted = async () => true
  })
  await page.goto('/library')
  const input = page.getByLabel('PDF 파일 선택')
  await expect(page.getByRole('button', { name: '책 추가' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(1)
  await input.setInputFiles(resolve('e2e/fixtures/ebook/with-metadata.pdf'))

  await expect(page.getByText('The Local Library')).toBeVisible()
  await expect(page.getByRole('img', { name: 'The Local Library 표지' })).toBeVisible()
  await expect(page.getByText('저장된 책 1권')).toBeVisible()

  await input.setInputFiles(resolve('e2e/fixtures/ebook/same-content-different-name.pdf'))
  await expect(page.getByText('이미 저장된 PDF입니다.')).toBeVisible()
  await expect(page.getByText('저장된 책 1권')).toBeVisible()

  await page.reload()
  await expect(page.getByText('The Local Library')).toBeVisible()
  await expect(page.getByRole('img', { name: 'The Local Library 표지' })).toBeVisible()
})

test('책 삭제를 취소하거나 완료하고 새로고침 후 남은 책을 복원한다', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.storage.persisted = async () => true
  })
  await page.goto('/library')
  await expect(page.getByRole('button', { name: '책 추가' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(1)
  await page
    .getByLabel('PDF 파일 선택')
    .setInputFiles([
      resolve('e2e/fixtures/ebook/with-metadata.pdf'),
      resolve('e2e/fixtures/ebook/without-metadata.pdf'),
    ])

  const firstBook = page.getByRole('article', { name: 'The Local Library' })
  const secondBook = page.getByRole('article', { name: 'without-metadata' })
  await expect(firstBook).toBeVisible()
  await expect(secondBook).toBeVisible()

  await firstBook.getByRole('button', { name: 'The Local Library 메뉴' }).click()
  await page.getByRole('menuitem', { name: '책 삭제' }).click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText(
    'PDF 원본과 읽기 위치가 이 브라우저에서 삭제되며 복구할 수 없습니다.',
  )
  await page.getByRole('button', { name: '취소' }).click()
  await expect(firstBook).toBeVisible()

  await firstBook.getByRole('button', { name: 'The Local Library 메뉴' }).click()
  await page.getByRole('menuitem', { name: '책 삭제' }).click()
  await page.getByRole('button', { name: '삭제' }).click()

  await expect(firstBook).toHaveCount(0)
  await expect(secondBook).toBeVisible()
  await expect(page.getByText('저장된 책 1권')).toBeVisible()
  await page.reload()
  await expect(firstBook).toHaveCount(0)
  await expect(secondBook).toBeVisible()
})

test('모든 데이터를 삭제한 뒤 빈 책장에서 다시 책을 추가한다', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.storage.persisted = async () => true
  })
  await page.goto('/library')
  const input = page.getByLabel('PDF 파일 선택')
  await expect(page.getByRole('button', { name: '책 추가' })).toBeVisible()
  await input.setInputFiles(resolve('e2e/fixtures/ebook/with-metadata.pdf'))
  const book = page.getByRole('article', { name: 'The Local Library' })
  await expect(book).toBeVisible()

  await page.getByRole('button', { name: '저장소 관리' }).click()
  await page.getByRole('button', { name: '모든 데이터 삭제' }).click()

  await expect(page.getByRole('button', { name: '책 추가' })).toBeVisible()
  await expect(book).toHaveCount(0)
  await input.setInputFiles(resolve('e2e/fixtures/ebook/with-metadata.pdf'))
  await expect(book).toBeVisible()
  await page.reload()
  await expect(book).toBeVisible()
})

test('표지 생성 실패를 복구하고 회전된 첫 페이지를 표지로 만든다', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.storage.persisted = async () => true
  })
  await page.goto('/library')
  await expect(page.getByRole('button', { name: '책 추가' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(1)
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      callback(null)
    }
  })
  await page
    .getByLabel('PDF 파일 선택')
    .setInputFiles(resolve('e2e/fixtures/ebook/rotated-one-page.pdf'))
  await expect(page.getByText('표지를 만들지 못했습니다.')).toBeVisible()
  await expect(page.getByText('기본 표지')).toBeVisible()
  await page.reload()
  const book = page.getByRole('article', { name: 'rotated-one-page' })
  await book.getByRole('button', { name: 'rotated-one-page 메뉴' }).click()
  await page.getByRole('menuitem', { name: '표지 다시 만들기' }).click()
  const cover = page.getByRole('img', { name: 'rotated-one-page 표지' })
  await expect(cover).toBeVisible()
  const size = await cover.evaluate((image: HTMLImageElement) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }))
  expect(size.width).toBeGreaterThan(size.height)
  expect(size.height).toBeGreaterThan(0)
})

test('키보드로 책을 연다', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.storage.persisted = async () => true
  })
  await page.goto('/library')
  await expect(page.getByRole('button', { name: '책 추가' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(1)
  await page
    .getByLabel('PDF 파일 선택')
    .setInputFiles(resolve('e2e/fixtures/ebook/with-metadata.pdf'))

  const card = page.getByRole('article', { name: 'The Local Library' })
  const cover = card.getByRole('button', { name: 'The Local Library 열기' })
  await expect(card).toBeVisible()
  await cover.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/books\//)
})

test.describe('터치 환경', () => {
  test.use({ hasTouch: true, viewport: { width: 320, height: 720 }, reducedMotion: 'reduce' })

  test('320px와 동작 감소 환경에서도 터치로 책을 연다', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.storage.persisted = async () => true
    })
    await page.goto('/library')
    await expect(page.getByRole('button', { name: '책 추가' })).toBeVisible()
    await page
      .getByLabel('PDF 파일 선택')
      .setInputFiles(resolve('e2e/fixtures/ebook/with-metadata.pdf'))

    const openBook = page.getByRole('button', { name: 'The Local Library 열기' })
    await openBook.scrollIntoViewIfNeeded()
    await expect(openBook).toBeInViewport()
    await openBook.tap()
    await expect(page).toHaveURL(/\/books\//)
  })
})
