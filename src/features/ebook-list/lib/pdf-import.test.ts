/// <reference types="node" />

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { GlobalWorkerOptions } from 'pdfjs-dist'
import { describe, expect, it } from 'vitest'
import { analyzePdf, PdfImportError } from './pdf-import'

const fixture = (name: string) => readFile(resolve('e2e/fixtures/ebook', name))

GlobalWorkerOptions.workerSrc = pathToFileURL(
  resolve('node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
).href

if (!('toHex' in Uint8Array.prototype)) {
  Object.defineProperty(Uint8Array.prototype, 'toHex', {
    value(this: Uint8Array) {
      return Array.from(this, (byte) => byte.toString(16).padStart(2, '0')).join('')
    },
  })
}

if (!('getOrInsertComputed' in Map.prototype)) {
  Object.defineProperty(Map.prototype, 'getOrInsertComputed', {
    value<K, V>(this: Map<K, V>, key: K, callback: (key: K) => V) {
      if (!this.has(key)) this.set(key, callback(key))
      return this.get(key)
    },
  })
}

describe('analyzePdf', () => {
  it('원본 내용의 SHA-256으로 식별하고 제목을 읽는다', async () => {
    const bytes = await fixture('with-metadata.pdf')
    const analyzed = await analyzePdf(new File([bytes], 'different-name.pdf'))
    const same = await analyzePdf(new File([bytes], 'same-content-different-name.pdf'))

    expect(analyzed.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(same.contentHash).toBe(analyzed.contentHash)
    expect(analyzed.title).toBe('The Local Library')
    expect(analyzed.pageCount).toBeGreaterThan(0)
    expect(analyzed.pdfData.byteLength).toBe(bytes.byteLength)
  })

  it('메타데이터가 없으면 파일명을 제목으로 사용한다', async () => {
    const analyzed = await analyzePdf(
      new File([await fixture('without-metadata.pdf')], '  내 책.pdf  '),
    )

    expect(analyzed.title).toBe('내 책')
  })

  it('손상되거나 암호가 필요한 PDF를 구분한다', async () => {
    await expect(
      analyzePdf(new File([await fixture('corrupted.pdf')], 'broken.pdf')),
    ).rejects.toMatchObject({ kind: 'invalid-document' } satisfies Partial<PdfImportError>)
    await expect(
      analyzePdf(new File([await fixture('password-protected.pdf')], 'secret.pdf')),
    ).rejects.toMatchObject({ kind: 'password-required' } satisfies Partial<PdfImportError>)
  })

  it('0페이지 PDF를 저장 가능한 문서로 취급하지 않는다', async () => {
    await expect(
      analyzePdf(new File([await fixture('zero-pages.pdf')], 'empty.pdf')),
    ).rejects.toMatchObject({ kind: 'invalid-document' } satisfies Partial<PdfImportError>)
  })

  it('canvas를 사용할 수 없어도 유효한 원본은 기본 표지 상태로 반환한다', async () => {
    const analyzed = await analyzePdf(
      new File([await fixture('rotated-one-page.pdf')], 'rotated.pdf'),
    )

    expect(analyzed.pageCount).toBe(1)
    expect(analyzed.coverStatus).toBe('fallback')
    expect(analyzed.coverData).toBeNull()
    expect(analyzed.coverMime).toBeNull()
  })
})
