import { describe, expect, it } from 'vitest'
import { postprocessKiwiText, type KiwiTextTools } from './postprocess'

describe('postprocessKiwiText', () => {
  it('줄 위치를 유지하며 Kiwi가 정규화한 문장으로 바꾼다', () => {
    const kiwi: KiwiTextTools = {
      tokenize: (line) =>
        line
          .split(' ')
          .filter(Boolean)
          .map((str) => ({ str, tag: 'NNG' })),
      joinSent: (morphs) => ({ str: morphs.map(({ form }) => form).join('·') }),
    }

    expect(postprocessKiwiText(kiwi, '한국어 OCR\n\n소스 코드')).toBe('한국어·OCR\n\n소스·코드')
  })
})
