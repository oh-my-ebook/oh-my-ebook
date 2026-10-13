import type { ThreadMessage } from '@assistant-ui/react'
import type { KiwiClient } from '@/lib/kiwi/kiwi.client'
import { afterEach, describe, expect, it, vi } from 'vitest'

async function createSearchStub() {
  const extractSearchTerms = vi.fn<KiwiClient['extractSearchTerms']>()
  vi.doMock('@/lib/kiwi/kiwi.client', () => ({ kiwiClient: { extractSearchTerms } }))
  const { searchBookChunks } = await import('./search-book-chunks')

  return { extractSearchTerms, searchBookChunks }
}

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('@/lib/kiwi/kiwi.client')
})

function createUserMessage(text: string): ThreadMessage {
  return {
    id: `user-${text}`,
    role: 'user',
    createdAt: new Date(0),
    content: [{ type: 'text', text }],
    attachments: [],
    metadata: { custom: {} },
  }
}

function createAssistantMessage(text: string): ThreadMessage {
  return {
    id: `assistant-${text}`,
    role: 'assistant',
    createdAt: new Date(0),
    content: [{ type: 'text', text }],
    status: { type: 'complete', reason: 'stop' },
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom: {},
    },
  }
}

describe('searchBookChunks', () => {
  it('최신 사용자 질문을 Kiwi로 분석하고 중복 term 없이 검색한다', async () => {
    const { extractSearchTerms, searchBookChunks } = await createSearchStub()
    const request = vi.fn().mockResolvedValue([
      {
        id: 'chunk-1',
        ordinal: 0,
        text: '검색 결과',
        tokenCount: 2,
        score: 1.5,
        sources: [{ pageNumber: 2, startLineIndex: 1, endLineIndex: 2 }],
      },
    ])
    extractSearchTerms.mockResolvedValue([
      { term: ' 전자책 ', termFrequency: 1 },
      { term: '검색', termFrequency: 2 },
      { term: '전자책', termFrequency: 1 },
      { term: '   ', termFrequency: 1 },
    ])
    const signal = new AbortController().signal

    await expect(
      searchBookChunks({
        bookId: 'book-id',
        messages: [
          createUserMessage('이전 질문'),
          createAssistantMessage('이전 답변'),
          createUserMessage('최신 질문'),
        ],
        signal,
        searchChunks: request,
      }),
    ).resolves.toEqual([
      {
        id: 'chunk-1',
        ordinal: 0,
        text: '검색 결과',
        tokenCount: 2,
        score: 1.5,
        sources: [{ pageNumber: 2, startLineIndex: 1, endLineIndex: 2 }],
      },
    ])
    expect(extractSearchTerms).toHaveBeenCalledWith('최신 질문', signal)
    expect(request).toHaveBeenCalledWith({
      bookId: 'book-id',
      terms: ['전자책', '검색'],
      limit: 5,
    })
  })

  it('Kiwi가 검색어를 추출하지 못하면 저장소를 검색하지 않는다', async () => {
    const { extractSearchTerms, searchBookChunks } = await createSearchStub()
    const request = vi.fn()
    extractSearchTerms.mockResolvedValue([])

    await expect(
      searchBookChunks({
        bookId: 'book-id',
        messages: [createUserMessage('검색되지 않는 질문')],
        signal: new AbortController().signal,
        searchChunks: request,
      }),
    ).resolves.toEqual([])
    expect(request).not.toHaveBeenCalled()
  })

  it.each([
    { name: '사용자 질문이 없으면', messages: [] },
    { name: '사용자 질문이 공백이면', messages: [createUserMessage('   ')] },
  ])('$name Kiwi와 저장소를 호출하지 않는다', async ({ messages }) => {
    const { extractSearchTerms, searchBookChunks } = await createSearchStub()
    const request = vi.fn()

    await expect(
      searchBookChunks({
        bookId: 'book-id',
        messages,
        signal: new AbortController().signal,
        searchChunks: request,
      }),
    ).resolves.toEqual([])
    expect(extractSearchTerms).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })

  it('Kiwi 분석 실패를 호출자에게 전달하고 저장소를 검색하지 않는다', async () => {
    const { extractSearchTerms, searchBookChunks } = await createSearchStub()
    const error = new Error('Kiwi 분석 실패')
    extractSearchTerms.mockRejectedValueOnce(error)
    const request = vi.fn()

    await expect(
      searchBookChunks({
        bookId: 'book-id',
        messages: [createUserMessage('검색 질문')],
        signal: new AbortController().signal,
        searchChunks: request,
      }),
    ).rejects.toBe(error)
    expect(request).not.toHaveBeenCalled()
  })
})
