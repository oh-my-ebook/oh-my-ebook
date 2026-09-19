/// <reference types="node" />

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { GlobalWorkerOptions } from 'pdfjs-dist'
import { describe, expect, it } from 'vitest'
import { analyzePdf, PdfImportError } from './pdf-import'

const fixture = (name: string) => readFile(resolve('e2e/fixtures/ebook', name))

function createPdfWithXmpMetadata(title: string, publisher: string): ArrayBuffer {
  const xmp = `<?xpacket begin="﻿"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li></rdf:Alt></dc:title><dc:publisher><rdf:Bag><rdf:li>${publisher}</rdf:li></rdf:Bag></dc:publisher></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /Metadata 5 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
    `<< /Type /Metadata /Subtype /XML /Length ${new TextEncoder().encode(xmp).length} >>\nstream\n${xmp}\nendstream`,
    '<< /Title (   ) /Author (   ) /Subject (   ) /Keywords (   ) >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(new TextEncoder().encode(pdf).length)
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xrefOffset = new TextEncoder().encode(pdf).length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`)
    .join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  const bytes = new TextEncoder().encode(pdf)
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

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
  it('원본 내용의 SHA-256으로 식별하고 Info 메타데이터를 읽는다', async () => {
    const bytes = await fixture('with-metadata.pdf')
    const analyzed = await analyzePdf(new File([bytes], 'different-name.pdf'))
    const same = await analyzePdf(new File([bytes], 'same-content-different-name.pdf'))

    expect(analyzed.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(same.contentHash).toBe(analyzed.contentHash)
    expect(analyzed.title).toBe('The Local Library')
    expect(analyzed.pdfTitle).toBe('The Local Library')
    expect(analyzed.author).toBe('Sample Author')
    expect(analyzed.pdfSubject).toBeNull()
    expect(analyzed.pdfKeywords).toBeNull()
    expect(analyzed.publisher).toBeNull()
    expect(analyzed.pageCount).toBeGreaterThan(0)
    expect(analyzed.pdfData.byteLength).toBe(bytes.byteLength)
    expect(analyzed.pdfSize).toBe(bytes.byteLength)
  })

  it('XMP 제목과 출판사를 읽고 공백 메타데이터를 null로 정규화한다', async () => {
    const pdf = createPdfWithXmpMetadata('XMP 제목', 'XMP 출판사')
    const analyzed = await analyzePdf(new File([pdf], 'xmp.pdf'))

    expect(analyzed.title).toBe('XMP 제목')
    expect(analyzed.pdfTitle).toBe('XMP 제목')
    expect(analyzed.publisher).toBe('XMP 출판사')
    expect(analyzed.author).toBeNull()
    expect(analyzed.pdfSubject).toBeNull()
    expect(analyzed.pdfKeywords).toBeNull()
  })

  it('메타데이터가 없으면 파일명을 제목으로 사용한다', async () => {
    const analyzed = await analyzePdf(
      new File([await fixture('without-metadata.pdf')], '  내 책.pdf  '),
    )

    expect(analyzed.title).toBe('내 책')
    expect(analyzed.pdfTitle).toBeNull()
    expect(analyzed.author).toBeNull()
    expect(analyzed.pdfSubject).toBeNull()
    expect(analyzed.pdfKeywords).toBeNull()
    expect(analyzed.publisher).toBeNull()
  })

  it('공백 메타데이터와 제목 없는 파일명은 제목 없음으로 정규화한다', async () => {
    const pdf = createPdfWithXmpMetadata('   ', '   ')
    const analyzed = await analyzePdf(new File([pdf], ' .pdf '))

    expect(analyzed.title).toBe('제목 없음')
    expect(analyzed.pdfTitle).toBeNull()
    expect(analyzed.publisher).toBeNull()
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
