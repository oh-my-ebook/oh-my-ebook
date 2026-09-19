import { describe, expect, it } from 'vitest'
import { sortInReadingOrder } from './reading-order'
import type { OcrLine } from './textbox-layer'

function line(text: string, x0: number, y0: number, x1: number, y1: number): OcrLine {
  return { text, bbox: { x0, y0, x1, y1 } }
}

function texts(lines: readonly OcrLine[]) {
  return sortInReadingOrder(lines).map(({ text }) => text)
}

describe('sortInReadingOrder', () => {
  it('양면 캡처는 왼쪽 페이지를 끝까지 읽은 뒤 오른쪽 페이지와 쪽번호를 읽는다', () => {
    // PaddleOCR처럼 y 좌표 기준으로 좌우 줄이 섞여 들어온다.
    const lines = [
      line('오른쪽 제목', 1_100, 90, 1_300, 110),
      line('왼쪽 1', 100, 100, 900, 120),
      line('오른쪽 1', 1_100, 130, 1_900, 150),
      line('왼쪽 2', 100, 140, 900, 160),
      line('오른쪽 2', 1_100, 170, 1_900, 190),
      line('왼쪽 3', 100, 180, 900, 200),
      line('190', 30, 1_000, 60, 1_020),
      line('191', 1_940, 1_000, 1_970, 1_020),
    ]

    expect(texts(lines)).toEqual([
      '왼쪽 1',
      '왼쪽 2',
      '왼쪽 3',
      '오른쪽 제목',
      '오른쪽 1',
      '오른쪽 2',
      '190',
      '191',
    ])
  })

  it('가운데를 가로지르는 줄이 있으면 가로 이미지를 두 페이지로 나누지 않는다', () => {
    const lines = [
      line('셋째 줄 오른쪽', 1_000, 198, 1_800, 218),
      line('제목', 100, 100, 1_800, 120),
      line('둘째 줄 오른쪽', 1_000, 152, 1_800, 172),
      line('셋째 줄 왼쪽', 100, 200, 800, 220),
      line('둘째 줄 왼쪽', 100, 150, 800, 170),
    ]

    expect(texts(lines)).toEqual([
      '제목',
      '둘째 줄 왼쪽',
      '둘째 줄 오른쪽',
      '셋째 줄 왼쪽',
      '셋째 줄 오른쪽',
    ])
  })

  it('카드 격자는 행 순서로 읽고 카드 안의 줄은 이어서 읽는다', () => {
    const lines = [
      line('카드 1 제목', 100, 100, 700, 120),
      line('카드 2 제목', 1_000, 100, 1_600, 120),
      line('카드 1 설명', 100, 140, 700, 160),
      line('카드 2 설명', 1_000, 140, 1_600, 160),
      line('카드 3 제목', 100, 300, 700, 320),
      line('카드 4 제목', 1_000, 300, 1_600, 320),
      line('카드 3 설명', 100, 340, 700, 360),
      line('카드 4 설명', 1_000, 340, 1_600, 360),
    ]

    expect(texts(lines)).toEqual([
      '카드 1 제목',
      '카드 1 설명',
      '카드 2 제목',
      '카드 2 설명',
      '카드 3 제목',
      '카드 3 설명',
      '카드 4 제목',
      '카드 4 설명',
    ])
  })
})
