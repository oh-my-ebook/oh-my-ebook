import { describe, expect, it } from 'vitest'
import { extractSearchTerms, normalizeText } from './kiwi.util'
import type { KiwiTools } from './kiwi.types'

describe('normalizeText', () => {
  it('줄 위치를 유지하며 Kiwi가 정규화한 문장으로 바꾼다', () => {
    const kiwi: KiwiTools = {
      tokenize: (line) =>
        line
          .split(' ')
          .filter(Boolean)
          .map((str) => ({ str, tag: 'NNG' })),
      joinSent: (morphs) => ({ str: morphs.map(({ form }) => form).join('·') }),
    }

    expect(normalizeText(kiwi, '한국어 OCR\n\n   \n소스 코드\n')).toBe(
      '한국어·OCR\n\n   \n소스·코드\n',
    )
  })
})

describe('extractSearchTerms', () => {
  it('의미 있는 형태소만 term 빈도로 집계한다', () => {
    const kiwi: KiwiTools = {
      tokenize: () => [
        { str: '전자책', tag: 'NNG' },
        { str: '은', tag: 'JX' },
        { str: '검색', tag: 'NNG' },
        { str: '검색', tag: 'NNG' },
        { str: ' 검색 ', tag: 'NNG' },
        { str: '   ', tag: 'NNG' },
        { str: '', tag: 'NNP' },
        { str: '편리하다', tag: 'VA' },
        { str: '.', tag: 'SF' },
        { str: 'PDF', tag: 'SL' },
        { str: '2026', tag: 'SN' },
      ],
      joinSent: () => ({ str: '' }),
    }

    expect(extractSearchTerms(kiwi, '전자책은 검색 검색이 편리하다. PDF 2026')).toEqual([
      { term: '전자책', termFrequency: 1 },
      { term: '검색', termFrequency: 3 },
      { term: '편리하다', termFrequency: 1 },
      { term: 'PDF', termFrequency: 1 },
      { term: '2026', termFrequency: 1 },
    ])
  })
})
