import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LibrarySummary } from './library-summary'

function createStoredBook(title: string, lastPage: number | null) {
  return {
    id: `${title}-id`,
    contentHash: `${title}-hash`,
    fileName: `${title}.pdf`,
    title,
    author: null,
    pdfTitle: null,
    pdfSubject: null,
    pdfKeywords: null,
    publisher: null,
    pdfSize: 0,
    pageCount: 10,
    coverData: null,
    coverMime: null,
    coverStatus: 'fallback' as const,
    pdfStatus: 'available' as const,
    lastPage: lastPage,
    analysisStatus: 'analyzing' as const,
    ocrCompletedAt: null,
    indexedAt: null,
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('LibrarySummary', () => {
  it('소장 도서 수와 사용량, 읽는 중, 완독 수를 표시한다', () => {
    render(
      <LibrarySummary
        books={[
          createStoredBook('읽는 책', 3),
          createStoredBook('다 읽은 책', 10),
          createStoredBook('읽지 않은 책', null),
        ]}
        usage={1024}
      />,
    )

    expect(screen.getByRole('group', { name: '서재 현황' })).toHaveTextContent(
      '소장 도서 3권 (1 KB)',
    )
    expect(screen.getByRole('group', { name: '서재 현황' })).toHaveTextContent('읽는 중 1')
    expect(screen.getByRole('group', { name: '서재 현황' })).toHaveTextContent('완독 1')
  })

  it('브라우저 저장소 사용량을 조회할 수 없으면 소장 도서에 확인 불가 상태를 표시한다', () => {
    render(<LibrarySummary books={[]} usage={null} />)

    expect(screen.getByRole('group', { name: '서재 현황' })).toHaveTextContent(
      '소장 도서 0권 (확인 불가)',
    )
  })
})
