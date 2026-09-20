/// <reference lib="dom" />

import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'
import { createPromiseController } from '../src/test/promise-controller.ts'

for (const { saved, system, background } of [
  { saved: 'dark', system: 'light', background: 'oklch(0.206 0.007 92)' },
  { saved: 'light', system: 'dark', background: 'oklch(0.938 0.0145 91.5)' },
  { saved: null, system: 'dark', background: 'oklch(0.206 0.007 92)' },
] as const) {
  test(`React 로딩 전부터 테마 배경을 표시한다 (저장: ${saved}, 시스템: ${system})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: system })
    await page.addInitScript((saved) => {
      if (saved) localStorage.setItem('theme', saved)
    }, saved)
    await page.route('https://fonts.googleapis.com/**', (route) =>
      route.fulfill({ contentType: 'text/css', body: '' }),
    )
    const loading = createPromiseController<void>()
    await page.route(/\/src\/main\.tsx(?:\?|$)/, async (route) => {
      await loading.promise
      await route.continue()
    })

    try {
      await page.goto('/library', { waitUntil: 'commit' })
      await expect(page.locator('#root')).toBeAttached()
      await expect(page.locator('#root')).toBeEmpty()
      await expect(page.locator('body')).toHaveCSS('background-color', background)
      await expect(page.locator('#root')).toBeEmpty()
    } finally {
      loading.resolve()
    }

    await expect(page.getByRole('heading', { name: '내 서재' })).toBeVisible()
    await expect(page.locator('body')).toHaveCSS('background-color', background)
  })
}

test('저장된 선택이 없으면 시스템 테마로 시작하고 직접 전환한 선택을 우선한다', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/library')
  await expect(page.getByRole('button', { name: '라이트 모드로 전환' })).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/dark/)
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBeNull()

  await page.emulateMedia({ colorScheme: 'light' })
  await page.reload()
  await expect(page.getByRole('button', { name: '다크 모드로 전환' })).toBeVisible()
  await expect(page.locator('html')).not.toHaveClass(/dark/)

  await page.getByRole('button', { name: '다크 모드로 전환' }).click()
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark')
  await page.reload()
  await expect(page.getByRole('button', { name: '라이트 모드로 전환' })).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/dark/)
})

test('저장된 테마 값이 잘못되어도 시스템 설정을 따른다', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'invalid'))
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/library')

  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('button', { name: '라이트 모드로 전환' })).toBeVisible()
})

test('선택한 테마를 저장하고 새로고침 후 복원한다', async ({ page }) => {
  await page.goto('/library')
  await page.getByRole('button', { name: '다크 모드로 전환' }).click()
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark')

  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('button', { name: '라이트 모드로 전환' }).click()
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('light')

  await page.reload()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await expect(page.getByRole('button', { name: '다크 모드로 전환' })).toBeVisible()
})

test('localStorage가 차단되어도 서재와 테마 전환을 사용할 수 있다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Storage is blocked', 'SecurityError')
      },
    })
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/library')
  await page.getByRole('button', { name: '다크 모드로 전환' }).click()

  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('button', { name: '라이트 모드로 전환' })).toBeVisible()
  expect(errors).toEqual([])
})

test('테마 전환 시 책 추가 카드의 색도 즉시 적용한다', async ({ page }) => {
  await page.goto('/library')
  const card = page.getByRole('button', { name: '책 추가' })
  await expect(card).toBeVisible()

  for (const dark of [true, false]) {
    const colors = await card.evaluate((element, dark) => {
      getComputedStyle(element).getPropertyValue('background-color')
      document.documentElement.classList.toggle('dark', dark)
      const animations = element.getAnimations()
      for (const animation of animations) {
        animation.pause()
        animation.currentTime = 0
      }
      const start = getComputedStyle(element).backgroundColor
      for (const animation of animations) animation.finish()
      return { start, end: getComputedStyle(element).backgroundColor }
    }, dark)
    expect(colors.start).toBe(colors.end)
  }
})

test('서재 푸터는 화면 하단에 놓이고 내용이 길면 본문 다음으로 밀린다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/library')
  await expect(page.getByRole('button', { name: '책 추가' })).toBeVisible()

  const footer = page.locator('footer')
  await expect(footer).toBeInViewport()
  expect(await footer.evaluate((element) => element.getBoundingClientRect().bottom)).toBe(900)

  await page.setViewportSize({ width: 320, height: 400 })
  const cardBottom = await page
    .getByRole('article', { name: '책 추가' })
    .evaluate((element) => element.getBoundingClientRect().bottom)
  const footerTop = await footer.evaluate((element) => element.getBoundingClientRect().top)
  expect(footerTop).toBeGreaterThanOrEqual(cardBottom)
  await footer.scrollIntoViewIfNeeded()
  await expect(page.getByRole('link', { name: '개인정보처리방침' })).toBeInViewport()
})

test('리더에서 선택한 테마를 서재에서도 전환할 수 있다', async ({ page }) => {
  await page.goto('/sample-reader')
  await page.getByRole('button', { name: '다크 모드로 전환' }).click()
  await page.getByRole('button', { name: '책장으로 돌아가기' }).click()

  const navigation = page.getByRole('navigation', { name: '주 탐색' })
  await expect(page.locator('html')).toHaveClass(/dark/)
  await navigation.getByRole('button', { name: '라이트 모드로 전환' }).click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)

  await page.setViewportSize({ width: 320, height: 720 })
  const toggle = navigation.getByRole('button', { name: '다크 모드로 전환' })
  await expect(toggle).toBeInViewport()
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('html')).toHaveClass(/dark/)
})

test('책장 진입 시 OPFS DB를 초기화하고 새로고침 후 빈 책장을 표시한다', async ({ page }) => {
  await page.goto('/library')

  await expect(page.getByRole('heading', { name: '내 서재' })).toBeVisible()
  await expect(page.getByRole('button', { name: '책 추가' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(1)
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
  await expect(page.getByRole('button', { name: '책 추가' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(1)
})

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

test('책 삭제를 취소하거나 완료하면 목록과 브라우저 저장소 사용량을 갱신한다', async ({ page }) => {
  await page.addInitScript(() => {
    let usage = 0
    navigator.storage.persisted = async () => true
    navigator.storage.estimate = async () => ({ usage })

    const original = Worker.prototype.postMessage
    Worker.prototype.postMessage = function (message, ...transfer) {
      if (typeof message === 'object' && message !== null && 'command' in message) {
        if (message.command === 'saveBook') usage = 2_000
        if (message.command === 'deleteBook') usage = 0
      }
      return Reflect.apply(original, this, [message, ...transfer])
    }
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
  await page.goto('/library')
  await expect(page.getByRole('button', { name: '책 추가' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(1)
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
  await page.goto('/library')
  await expect(page.getByRole('button', { name: '책 추가' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(1)
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
  await page.goto('/library')
  await expect(page.getByRole('button', { name: '책 추가' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(1)
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
        message.command === 'saveBook' &&
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
  await page.goto('/library')
  await expect(page.getByRole('button', { name: '책 추가' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(1)
  await page
    .getByLabel('PDF 파일 선택')
    .setInputFiles(resolve('e2e/fixtures/ebook/with-metadata.pdf'))

  await expect(page.getByText('PDF 저장에 실패했습니다. 다시 시도해 주세요.')).toBeVisible()
  await expect(page.getByRole('button', { name: '책 추가' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(1)
  await page.reload()
  await expect(page.getByRole('button', { name: '책 추가' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(1)
})

test('WebP 인코딩을 사용할 수 없으면 PNG 표지를 저장한다', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.storage.persisted = async () => true
  })
  await page.goto('/library')
  await expect(page.getByRole('button', { name: '책 추가' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(1)
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
  await page.goto('/library')
  await expect(page.getByRole('button', { name: '책 추가' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(1)
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
  await page.goto('/library')
  await expect(page.getByRole('button', { name: '책 추가' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(1)
  await page
    .getByLabel('PDF 파일 선택')
    .setInputFiles([
      resolve('e2e/fixtures/ebook/with-metadata.pdf'),
      resolve('e2e/fixtures/ebook/without-metadata.pdf'),
    ])

  const shelf = page.locator('.ebook-shelf')
  const cards = page.getByRole('article')
  await expect(shelf).toBeVisible()
  await expect(cards).toHaveCount(3)
  const firstCard = cards.nth(1)
  const secondCard = cards.nth(2)
  const firstBounds = await firstCard.boundingBox()
  const secondBounds = await secondCard.boundingBox()
  expect(firstBounds?.x).toBe(secondBounds?.x)
  expect(firstBounds?.y).toBeLessThan(secondBounds?.y ?? 0)

  await firstCard.getByRole('button', { name: / 열기$/ }).tap()
  await expect(page).toHaveURL(/\/books\//)
  await context.close()
})
