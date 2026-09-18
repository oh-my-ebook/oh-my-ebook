import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LibrarySummary } from './library-summary'

function createStoredBook(title: string, lastPage: number | null) {
  return {
    id: `${title}-id`,
    content_hash: `${title}-hash`,
    file_name: `${title}.pdf`,
    title,
    author: null,
    pdf_title: null,
    pdf_subject: null,
    pdf_keywords: null,
    publisher: null,
    pdf_size: 0,
    page_count: 10,
    cover_data: null,
    cover_mime: null,
    cover_status: 'fallback' as const,
    last_page: lastPage,
    created_at: 0,
    updated_at: 0,
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
