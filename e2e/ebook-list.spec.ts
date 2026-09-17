/// <reference lib="dom" />

import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'

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

test('PDF를 추가하고 내용 중복을 막으며 새로고침 후 표지와 책 정보를 복원한다', async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.storage.persisted = async () => true
  })
  await page.goto('/')
  const input = page.getByLabel('PDF 파일 선택')
  await expect(page.getByText('아직 저장한 책이 없습니다.')).toBeVisible()
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

test('메타데이터가 없는 책과 손상·암호 PDF를 파일별로 처리한다', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.storage.persisted = async () => true
  })
  await page.goto('/')
  await expect(page.getByText('아직 저장한 책이 없습니다.')).toBeVisible()
  await page
    .getByLabel('PDF 파일 선택')
    .setInputFiles([
      resolve('e2e/fixtures/ebook/without-metadata.pdf'),
      resolve('e2e/fixtures/ebook/corrupted.pdf'),
      resolve('e2e/fixtures/ebook/password-protected.pdf'),
    ])

  await expect(page.getByText('저장된 책 1권')).toBeVisible()
  await expect(page.getByText('without-metadata', { exact: true })).toBeVisible()
  await expect(page.getByText(/손상되었거나 페이지가 없는 PDF/)).toBeVisible()
  await expect(page.getByText(/암호가 필요한 PDF/)).toBeVisible()
})

test('표지 생성 실패를 복구하고 회전된 첫 페이지를 표지로 만든다', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.storage.persisted = async () => true
  })
  await page.goto('/')
  await expect(page.getByText('아직 저장한 책이 없습니다.')).toBeVisible()
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      Reflect.set(window, 'lastCoverCanvas', this)
      callback(null)
    }
  })
  await page
    .getByLabel('PDF 파일 선택')
    .setInputFiles(resolve('e2e/fixtures/ebook/rotated-one-page.pdf'))
  await expect(page.getByText('표지를 만들지 못했습니다.')).toBeVisible()
  await expect(page.getByText('기본 표지')).toBeVisible()
  const releasedCanvas = await page.evaluate(() => {
    const canvas = Reflect.get(window, 'lastCoverCanvas')
    return canvas instanceof HTMLCanvasElement ? [canvas.width, canvas.height] : null
  })
  expect(releasedCanvas).toEqual([0, 0])

  await page.reload()
  await page.getByRole('button', { name: '표지 다시 만들기' }).click()
  const cover = page.getByRole('img', { name: 'rotated-one-page 표지' })
  await expect(cover).toBeVisible()
  const size = await cover.evaluate((image: HTMLImageElement) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }))
  expect(size).toEqual({ width: 480, height: 320 })
})

test('예상 공간이 부족하면 저장하지 않는다', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.storage.persisted = async () => true
    navigator.storage.estimate = async () => ({ usage: 100, quota: 101 })
  })
  await page.goto('/')
  await expect(page.getByText('아직 저장한 책이 없습니다.')).toBeVisible()
  await page
    .getByLabel('PDF 파일 선택')
    .setInputFiles(resolve('e2e/fixtures/ebook/with-metadata.pdf'))
  await expect(page.getByText('브라우저 저장 공간이 부족합니다.')).toBeVisible()
  await expect(page.getByText('아직 저장한 책이 없습니다.')).toBeVisible()
})

test('저장 공간이 1GB 이하이면 영구 저장을 요청하고 거부를 알린다', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.storage.persisted = async () => false
    navigator.storage.persist = async () => false
    navigator.storage.estimate = async () => ({ usage: 0, quota: 1024 ** 3 })
  })
  await page.goto('/')
  await expect(page.getByText('아직 저장한 책이 없습니다.')).toBeVisible()
  await expect(page.getByRole('button', { name: '영구 저장 요청' })).toBeVisible()
  await page
    .getByLabel('PDF 파일 선택')
    .setInputFiles(resolve('e2e/fixtures/ebook/with-metadata.pdf'))

  await expect(page.getByRole('button', { name: 'PDF 추가' })).toBeEnabled()
  await expect(page.getByText('The Local Library')).toBeVisible()
  await page.getByRole('button', { name: '영구 저장 요청' }).click()
  await expect(page.getByText('영구 저장 전환에 실패했습니다.')).toBeVisible()
})

test('실제 저장 요청이 실패해도 불완전한 책을 표시하지 않는다', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.storage.persisted = async () => true
    const original = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (message, transfer) {
      if (
        typeof message === 'object' &&
        message !== null &&
        'command' in message &&
        message.command === 'addBook' &&
        'requestId' in message
      ) {
        setTimeout(() => {
          this.dispatchEvent(
            new MessageEvent('message', {
              data: { requestId: message.requestId, error: { code: 'storage-failed' } },
            }),
          )
        }, 0)
        return
      }
      Reflect.apply(original, this, [message, transfer])
    }
  })
  await page.goto('/')
  await expect(page.getByText('아직 저장한 책이 없습니다.')).toBeVisible()
  await page
    .getByLabel('PDF 파일 선택')
    .setInputFiles(resolve('e2e/fixtures/ebook/with-metadata.pdf'))

  await expect(page.getByText('PDF 저장에 실패했습니다. 다시 시도해 주세요.')).toBeVisible()
  await expect(page.getByText('아직 저장한 책이 없습니다.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('아직 저장한 책이 없습니다.')).toBeVisible()
})

test('WebP 인코딩을 사용할 수 없으면 PNG 표지를 저장한다', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.storage.persisted = async () => true
  })
  await page.goto('/')
  await expect(page.getByText('아직 저장한 책이 없습니다.')).toBeVisible()
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      if (type === 'image/webp') {
        callback(null)
        return
      }
      original.call(this, callback, type, quality)
    }
  })
  await page
    .getByLabel('PDF 파일 선택')
    .setInputFiles(resolve('e2e/fixtures/ebook/with-metadata.pdf'))
  const cover = page.getByRole('img', { name: 'The Local Library 표지' })
  await expect(cover).toBeVisible()
  const mime = await cover.evaluate(async (image: HTMLImageElement) =>
    (await fetch(image.src)).blob().then((blob) => blob.type),
  )
  expect(mime).toBe('image/png')
})
