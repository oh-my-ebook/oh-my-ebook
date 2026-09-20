import { afterEach, describe, expect, it, vi } from 'vitest'

const { postprocessWithKiwi } = vi.hoisted(() => ({ postprocessWithKiwi: vi.fn() }))

vi.mock('@/lib/kiwi/client', () => ({ postprocessWithKiwi }))

import type { OcrLineForChunking } from '../../ebook-types'
import { createSearchChunks } from './search-chunking'

describe('createSearchChunks', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('OCR 원문이 빈 줄뿐이면 Kiwi 처리 없이 빈 청크 목록을 반환한다', async () => {
    const chunks = await createSearchChunks(
      [
        { ocr_page_id: 'page-1', page_number: 1, line_index: 0, raw_text: '' },
        { ocr_page_id: 'page-1', page_number: 1, line_index: 1, raw_text: '   ' },
      ],
      new AbortController().signal,
    )

    expect(chunks).toEqual([])
    expect(postprocessWithKiwi).not.toHaveBeenCalled()
  })

  it('빈 줄로 문단을 나누고 짧은 문단을 합치며 페이지별 줄 범위를 남긴다', async () => {
    const lines: OcrLineForChunking[] = [
      { ocr_page_id: 'page-1', page_number: 1, line_index: 0, raw_text: '첫 문장' },
      { ocr_page_id: 'page-1', page_number: 1, line_index: 1, raw_text: '둘째 문장' },
      { ocr_page_id: 'page-1', page_number: 1, line_index: 2, raw_text: '' },
      { ocr_page_id: 'page-2', page_number: 2, line_index: 0, raw_text: '셋째 문장' },
    ]
    postprocessWithKiwi.mockImplementation(async (text: string) => text)

    const chunks = await createSearchChunks(lines, new AbortController().signal, 6)

    expect(chunks).toEqual([
      expect.objectContaining({
        ordinal: 0,
        text: '첫 문장 둘째 문장\n\n셋째 문장',
        tokenCount: 6,
      }),
    ])
    expect(chunks[0]?.sources).toEqual([
      { ocrPageId: 'page-1', startLineIndex: 0, endLineIndex: 1, sourceOrder: 0 },
      { ocrPageId: 'page-2', startLineIndex: 0, endLineIndex: 0, sourceOrder: 1 },
    ])
  })

  it('목표 길이를 넘는 문장은 토큰 단위로 나누고 같은 OCR 줄을 연결한다', async () => {
    const lines: OcrLineForChunking[] = [
      {
        ocr_page_id: 'page-1',
        page_number: 1,
        line_index: 0,
        raw_text: '하나 둘 셋 넷 다섯',
      },
    ]
    postprocessWithKiwi.mockImplementation(async (text: string) => text)

    const chunks = await createSearchChunks(lines, new AbortController().signal, 2)

    expect(chunks.map(({ text, tokenCount }) => ({ text, tokenCount }))).toEqual([
      { text: '하나 둘', tokenCount: 2 },
      { text: '셋 넷', tokenCount: 2 },
      { text: '다섯', tokenCount: 1 },
    ])
    expect(chunks.map(({ sources }) => sources)).toEqual([
      [{ ocrPageId: 'page-1', startLineIndex: 0, endLineIndex: 0, sourceOrder: 0 }],
      [{ ocrPageId: 'page-1', startLineIndex: 0, endLineIndex: 0, sourceOrder: 0 }],
      [{ ocrPageId: 'page-1', startLineIndex: 0, endLineIndex: 0, sourceOrder: 0 }],
    ])
  })

  it('긴 문단에서 OCR 줄을 넘는 문장을 문장 경계로 분할하고 관련 줄 범위를 연결한다', async () => {
    const lines: OcrLineForChunking[] = [
      { ocr_page_id: 'page-1', page_number: 1, line_index: 0, raw_text: '하나 둘 셋' },
      {
        ocr_page_id: 'page-1',
        page_number: 1,
        line_index: 1,
        raw_text: '넷 다섯. 여섯 일곱 여덟 아홉.',
      },
    ]
    postprocessWithKiwi.mockImplementation(async (text: string) => text)

    const chunks = await createSearchChunks(lines, new AbortController().signal, 4)

    expect(chunks.map(({ text, tokenCount }) => ({ text, tokenCount }))).toEqual([
      { text: '하나 둘 셋 넷', tokenCount: 4 },
      { text: '다섯.', tokenCount: 1 },
      { text: '여섯 일곱 여덟 아홉.', tokenCount: 4 },
    ])
    expect(chunks.map(({ sources }) => sources)).toEqual([
      [{ ocrPageId: 'page-1', startLineIndex: 0, endLineIndex: 1, sourceOrder: 0 }],
      [{ ocrPageId: 'page-1', startLineIndex: 1, endLineIndex: 1, sourceOrder: 0 }],
      [{ ocrPageId: 'page-1', startLineIndex: 1, endLineIndex: 1, sourceOrder: 0 }],
    ])
  })
})
