import type { ThreadMessage } from '@assistant-ui/react'
import { describe, expect, it, vi } from 'vitest'

const { extractSearchTermsWithKiwi } = vi.hoisted(() => ({
  extractSearchTermsWithKiwi: vi.fn(),
}))

vi.mock('@/lib/kiwi/client', () => ({ extractSearchTermsWithKiwi }))

import { searchBookChunks } from './search-book-chunks'

function createUserMessage(text: string): ThreadMessage {
  return {
    id: `user-${text}`,
    role: 'user',
    createdAt: new Date(),
    content: [{ type: 'text', text }],
    attachments: [],
    metadata: { custom: {} },
  }
}

function createAssistantMessage(text: string): ThreadMessage {
  return {
    id: `assistant-${text}`,
    role: 'assistant',
    createdAt: new Date(),
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
    extractSearchTermsWithKiwi.mockResolvedValue([
      { term: '전자책', termFrequency: 1 },
      { term: '검색', termFrequency: 2 },
      { term: '전자책', termFrequency: 1 },
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
    expect(extractSearchTermsWithKiwi).toHaveBeenCalledWith('최신 질문', signal)
    expect(request).toHaveBeenCalledWith({
      bookId: 'book-id',
      terms: ['전자책', '검색'],
      limit: 5,
    })
  })

  it('검색 term이나 사용자 질문이 없으면 Worker를 호출하지 않는다', async () => {
    const request = vi.fn()
    extractSearchTermsWithKiwi.mockResolvedValue([])

    await expect(
      searchBookChunks({
        bookId: 'book-id',
        messages: [createUserMessage('검색되지 않는 질문')],
        signal: new AbortController().signal,
        searchChunks: request,
      }),
    ).resolves.toEqual([])
    await expect(
      searchBookChunks({
        bookId: 'book-id',
        messages: [],
        signal: new AbortController().signal,
        searchChunks: request,
      }),
    ).resolves.toEqual([])
    expect(request).not.toHaveBeenCalled()
  })
})
