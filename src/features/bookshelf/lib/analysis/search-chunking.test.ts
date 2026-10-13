import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KiwiClient } from '@/lib/kiwi/kiwi.client'
import type { OcrLineForChunking } from '@/lib/ebook-storage/types/ocr'

async function createChunkingStub() {
  const normalizeText = vi.fn<KiwiClient['normalizeText']>()
  vi.doMock('@/lib/kiwi/kiwi.client', () => ({ kiwiClient: { normalizeText } }))
  const { createSearchChunks } = await import('./search-chunking')

  return { normalizeText, createSearchChunks }
}

describe('createSearchChunks', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('@/lib/kiwi/kiwi.client')
  })

  it('OCR 원문이 빈 줄뿐이면 Kiwi 처리 없이 빈 청크 목록을 반환한다', async () => {
    const { normalizeText, createSearchChunks } = await createChunkingStub()
    const chunks = await createSearchChunks(
      [
        { ocrPageId: 'page-1', pageNumber: 1, lineIndex: 0, rawText: '' },
        { ocrPageId: 'page-1', pageNumber: 1, lineIndex: 1, rawText: '   ' },
      ],
      new AbortController().signal,
    )

    expect(chunks).toEqual([])
    expect(normalizeText).not.toHaveBeenCalled()
  })

  it('빈 줄로 문단을 나누고 짧은 문단을 합치며 페이지별 줄 범위를 남긴다', async () => {
    const { normalizeText, createSearchChunks } = await createChunkingStub()
    const lines: OcrLineForChunking[] = [
      { ocrPageId: 'page-1', pageNumber: 1, lineIndex: 0, rawText: '첫 문장' },
      { ocrPageId: 'page-1', pageNumber: 1, lineIndex: 1, rawText: '둘째 문장' },
      { ocrPageId: 'page-1', pageNumber: 1, lineIndex: 2, rawText: '' },
      { ocrPageId: 'page-2', pageNumber: 2, lineIndex: 0, rawText: '셋째 문장' },
    ]
    normalizeText.mockImplementation(async (text: string) => text)

    const signal = new AbortController().signal
    const chunks = await createSearchChunks(lines, signal, 6)

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
    expect(normalizeText).toHaveBeenCalledWith('첫 문장\n둘째 문장', signal)
    expect(normalizeText).toHaveBeenCalledWith('셋째 문장', signal)
  })

  it('목표 길이를 넘는 문장은 토큰 단위로 나누고 같은 OCR 줄을 연결한다', async () => {
    const { normalizeText, createSearchChunks } = await createChunkingStub()
    const lines: OcrLineForChunking[] = [
      {
        ocrPageId: 'page-1',
        pageNumber: 1,
        lineIndex: 0,
        rawText: '하나 둘 셋 넷 다섯',
      },
    ]
    normalizeText.mockImplementation(async (text: string) => text)

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
    const { normalizeText, createSearchChunks } = await createChunkingStub()
    const lines: OcrLineForChunking[] = [
      { ocrPageId: 'page-1', pageNumber: 1, lineIndex: 0, rawText: '하나 둘 셋' },
      {
        ocrPageId: 'page-1',
        pageNumber: 1,
        lineIndex: 1,
        rawText: '넷 다섯. 여섯 일곱 여덟 아홉.',
      },
    ]
    normalizeText.mockImplementation(async (text: string) => text)

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

  it('정규화 결과의 줄 수가 달라지면 OCR 출처를 잘못 연결하지 않고 실패한다', async () => {
    const { normalizeText, createSearchChunks } = await createChunkingStub()
    normalizeText.mockResolvedValueOnce('합쳐진 한 줄')
    const lines: OcrLineForChunking[] = [
      { ocr_page_id: 'page-1', page_number: 1, line_index: 0, raw_text: '첫 줄' },
      { ocr_page_id: 'page-1', page_number: 1, line_index: 1, raw_text: '둘째 줄' },
    ]

    await expect(createSearchChunks(lines, new AbortController().signal)).rejects.toThrow(
      'Kiwi 처리 결과의 줄 수가 OCR 원문과 다릅니다.',
    )
  })
})
