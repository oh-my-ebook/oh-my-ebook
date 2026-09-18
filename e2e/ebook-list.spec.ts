/// <reference lib="dom" />

import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'

test('책장 진입 시 OPFS DB를 초기화하고 새로고침 후 빈 책장을 표시한다', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: '내 서재' })).toBeVisible()
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

test('책 삭제를 취소하거나 완료하면 목록과 브라우저 저장소 사용량을 갱신한다', async ({ page }) => {
  await page.addInitScript(() => {
    let usage = 0
    navigator.storage.persisted = async () => true
    navigator.storage.estimate = async () => ({ usage })

    const original = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (message, ...transfer) {
      if (typeof message === 'object' && message !== null && 'command' in message) {
        if (message.command === 'addBook') usage = 2_000
        if (message.command === 'deleteBook') usage = 0
      }
      return Reflect.apply(original, this, [message, ...transfer])
    }
  })
  await page.goto('/')
  await expect(page.getByText('아직 저장한 책이 없습니다.')).toBeVisible()
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
  await expect(page.getByText('소장 도서 2권 (2 KB)')).toBeVisible()

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
  await expect(page.getByText('소장 도서 1권 (0 B)')).toBeVisible()
})

test('책 삭제 저장이 실패하면 책을 유지하고 재시도 안내를 보여 준다', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.storage.persisted = async () => true

    const original = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (message, ...transfer) {
      if (
        typeof message === 'object' &&
        message !== null &&
        'command' in message &&
        message.command === 'deleteBook' &&
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
      return Reflect.apply(original, this, [message, ...transfer])
    }
  })
  await page.goto('/')
  await expect(page.getByText('아직 저장한 책이 없습니다.')).toBeVisible()
  await page
    .getByLabel('PDF 파일 선택')
    .setInputFiles(resolve('e2e/fixtures/ebook/with-metadata.pdf'))

  const book = page.getByRole('article', { name: 'The Local Library' })
  await expect(book).toBeVisible()
  await book.getByRole('button', { name: 'The Local Library 메뉴' }).click()
  await page.getByRole('menuitem', { name: '책 삭제' }).click()
  await page.getByRole('button', { name: '삭제' }).click()

  await expect(page.getByRole('alert')).toContainText('책을 삭제하지 못했습니다.')
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible()
  await page.getByRole('button', { name: '취소' }).click()
  await expect(book).toBeVisible()
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
  const book = page.getByRole('article', { name: 'rotated-one-page' })
  await book.getByRole('button', { name: 'rotated-one-page 메뉴' }).click()
  await page.getByRole('menuitem', { name: '표지 다시 만들기' }).click()
  const cover = page.getByRole('img', { name: 'rotated-one-page 표지' })
  await expect(cover).toBeVisible()
  const size = await cover.evaluate((image: HTMLImageElement) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }))
  expect(size).toEqual({ width: 480, height: 320 })
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

test('정밀 포인터에서 표지 hover 효과를 보이고 키보드로 책을 연다', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.storage.persisted = async () => true
  })
  await page.goto('/')
  await expect(page.getByText('아직 저장한 책이 없습니다.')).toBeVisible()
  await page
    .getByLabel('PDF 파일 선택')
    .setInputFiles(resolve('e2e/fixtures/ebook/with-metadata.pdf'))

  const card = page.getByRole('article', { name: 'The Local Library' })
  const cover = card.getByRole('button', { name: 'The Local Library 열기' })
  await expect(card).toBeVisible()
  await card.hover({ position: { x: 10, y: 10 } })
  await expect
    .poll(() => cover.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe('none')

  await page.getByRole('heading', { name: '내 서재' }).hover()
  await expect
    .poll(() => cover.evaluate((element) => getComputedStyle(element).transform))
    .toBe('none')

  await cover.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/books\//)
})

test('320px와 동작 감소 환경에서도 터치로 책을 연다', async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 320, height: 720 },
  })
  const page = await context.newPage()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    navigator.storage.persisted = async () => true
  })
  await page.goto('/')
  await expect(page.getByText('아직 저장한 책이 없습니다.')).toBeVisible()
  await page
    .getByLabel('PDF 파일 선택')
    .setInputFiles([
      resolve('e2e/fixtures/ebook/with-metadata.pdf'),
      resolve('e2e/fixtures/ebook/without-metadata.pdf'),
    ])

  const shelf = page.locator('.ebook-shelf')
  const cards = page.getByRole('article')
  await expect(shelf).toBeVisible()
  await expect(cards).toHaveCount(2)
  const firstCard = cards.nth(0)
  const secondCard = cards.nth(1)
  const firstBounds = await firstCard.boundingBox()
  const secondBounds = await secondCard.boundingBox()
  expect(firstBounds?.x).toBe(secondBounds?.x)
  expect(firstBounds?.y).toBeLessThan(secondBounds?.y ?? 0)

  await firstCard.getByRole('button', { name: / 열기$/ }).tap()
  await expect(page).toHaveURL(/\/books\//)
  await context.close()
})
