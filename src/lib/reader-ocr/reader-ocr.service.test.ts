// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPromiseController } from '@/test/promise-controller'
import type { PageImage, TextBox } from '@/lib/reader-ocr/reader-ocr.types'
import type { ReaderOcrClient } from './reader-ocr.types'
import { ReaderOcrService } from './reader-ocr.service'

afterEach(() => vi.restoreAllMocks())

function image(): PageImage {
  return {
    bytes: new Uint8Array([137, 80, 78, 71]),
    mimeType: 'image/png',
    width: 2_000,
    height: 1_500,
  }
}

function line(text: string, x0: number, y0: number, x1: number, y1: number): TextBox {
  return { text, bbox: { x0, y0, x1, y1 } }
}

function createService(lines: readonly TextBox[] = []) {
  const initOcr = vi.fn(async () => {})
  const recognize = vi.fn<ReaderOcrClient['recognize']>().mockResolvedValue(lines)
  const normalizeText = vi.fn(async (text: string, _signal: AbortSignal) => text)
  const service = new ReaderOcrService({ initOcr, recognize }, { normalizeText })
  return { service, initOcr, recognize, normalizeText }
}

function stubMeasurer() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '',
    measureText: () => ({ width: 200 }),
  } as unknown as CanvasRenderingContext2D)
}

describe('ReaderOcrService', () => {
  it('준비 요청이 있을 때만 OCR과 정규화를 초기화하며 실패 후 재시도할 수 있다', async () => {
    const { service, initOcr, normalizeText } = createService()
    expect(initOcr).not.toHaveBeenCalled()
    initOcr.mockRejectedValueOnce(new Error('초기화 실패'))

    await expect(service.init()).rejects.toThrow('초기화 실패')
    await expect(service.init()).resolves.toBeUndefined()
    expect(normalizeText).toHaveBeenCalledWith('', expect.any(AbortSignal))
  })

  it('이미지 바이트와 취소 신호를 엔진에 전달하고 Kiwi 처리 전 원시 줄을 반환한다', async () => {
    const { service, recognize, normalizeText } = createService([line('원문', 0, 0, 100, 20)])
    const input = image()
    const signal = new AbortController().signal

    const result = await service.recognize(input, signal)

    expect(recognize).toHaveBeenCalledWith(input, signal)
    expect(result).toEqual({
      width: input.width,
      height: input.height,
      lines: [line('원문', 0, 0, 100, 20)],
    })
    expect(normalizeText).not.toHaveBeenCalled()
  })

  it('새 이미지의 줄을 읽기 순서로 보정하고 원래 좌표에 맞춘다', async () => {
    stubMeasurer()
    const { service, normalizeText } = createService([
      line('오른쪽', 1_100, 110, 1_900, 150),
      line('왼쪽', 100, 100, 900, 140),
    ])
    normalizeText.mockResolvedValue('왼쪽 보정\n오른쪽 보정')

    const result = await service.readImage(image(), new AbortController().signal)

    expect(normalizeText).toHaveBeenCalledWith('왼쪽\n오른쪽', expect.any(AbortSignal))
    expect(result.lines.map(({ text, x0 }) => ({ text, x0 }))).toEqual([
      { text: '왼쪽 보정', x0: 100 },
      { text: '오른쪽 보정', x0: 1_100 },
    ])
  })

  it('저장된 줄의 순서와 좌표를 유지하며 텍스트를 보정한다', async () => {
    stubMeasurer()
    const { service, recognize, normalizeText } = createService()
    normalizeText.mockResolvedValue('첫째 보정\n둘째 보정')
    const signal = new AbortController().signal

    const result = await service.postprocessPage(
      {
        width: 1_000,
        height: 1_500,
        lines: [line('첫째', 100, 260, 500, 300), line('둘째', 100, 200, 500, 240)],
      },
      signal,
    )

    expect(normalizeText).toHaveBeenCalledWith('첫째\n둘째', signal)
    expect(result.lines.map(({ text, y0 }) => ({ text, y0 }))).toEqual([
      { text: '첫째 보정', y0: 260 },
      { text: '둘째 보정', y0: 200 },
    ])
    expect(recognize).not.toHaveBeenCalled()
  })

  it('취소된 이미지 요청은 엔진을 시작하지 않고 늦은 결과도 후처리하지 않는다', async () => {
    const { service, recognize, normalizeText } = createService()
    const controller = new AbortController()
    controller.abort()
    await expect(service.readImage(image(), controller.signal)).rejects.toBe(
      controller.signal.reason,
    )
    expect(recognize).not.toHaveBeenCalled()

    const pending = createPromiseController<readonly TextBox[]>()
    recognize.mockReturnValueOnce(pending.promise)
    const next = new AbortController()
    const reading = service.readImage(image(), next.signal)
    next.abort()
    pending.resolve([line('늦은 줄', 0, 0, 100, 20)])
    await expect(reading).rejects.toBe(next.signal.reason)
    expect(normalizeText).not.toHaveBeenCalled()
  })

  it('인식과 보정 실패를 호출자에게 전달한다', async () => {
    stubMeasurer()
    const { service, recognize, normalizeText } = createService([line('원문', 0, 0, 100, 20)])
    recognize.mockRejectedValueOnce(new Error('인식 실패'))
    await expect(service.readImage(image(), new AbortController().signal)).rejects.toThrow(
      '인식 실패',
    )
    normalizeText.mockRejectedValueOnce(new Error('보정 실패'))
    await expect(service.readImage(image(), new AbortController().signal)).rejects.toThrow(
      '보정 실패',
    )
  })
})

async function texts(lines: readonly TextBox[]) {
  const { service } = createService(lines)
  const result = await service.recognize(image(), new AbortController().signal)
  return result.lines.map(({ text }) => text)
}

describe('ReaderOcrService 읽기 순서', () => {
  it('양면 캡처는 왼쪽 페이지를 끝까지 읽은 뒤 오른쪽 페이지와 쪽번호를 읽는다', async () => {
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

    expect(await texts(lines)).toEqual([
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

  it('가운데를 가로지르는 줄이 있으면 가로 이미지를 두 페이지로 나누지 않는다', async () => {
    const lines = [
      line('셋째 줄 오른쪽', 1_000, 198, 1_800, 218),
      line('제목', 100, 100, 1_800, 120),
      line('둘째 줄 오른쪽', 1_000, 152, 1_800, 172),
      line('셋째 줄 왼쪽', 100, 200, 800, 220),
      line('둘째 줄 왼쪽', 100, 150, 800, 170),
    ]

    expect(await texts(lines)).toEqual([
      '제목',
      '둘째 줄 왼쪽',
      '둘째 줄 오른쪽',
      '셋째 줄 왼쪽',
      '셋째 줄 오른쪽',
    ])
  })

  it('세로 2단 페이지는 단 사이 여백이 좁고 머리말·꼬리말이 가로질러도 단 순서로 읽는다', async () => {
    // 여백 30은 줄 높이 20의 1.5배이고, 좌우 줄 높이는 서로 어긋나 있다.
    const lines = [
      line('머리말 왼쪽', 30, 30, 160, 50),
      line('머리말 가운데', 280, 30, 600, 50),
      line('머리말 오른쪽', 730, 30, 980, 50),
      line('왼쪽 1', 30, 80, 560, 100),
      line('오른쪽 1', 590, 92, 1_100, 112),
      line('왼쪽 2', 30, 108, 560, 128),
      line('오른쪽 2', 590, 121, 1_100, 141),
      line('왼쪽 3', 30, 136, 560, 156),
      line('오른쪽 3', 590, 150, 1_100, 170),
      line('오른쪽 4', 590, 179, 1_100, 199),
      line('왼쪽 4', 30, 190, 560, 210),
      line('오른쪽 5', 590, 208, 1_100, 228),
      line('왼쪽 5', 30, 218, 560, 238),
      line('오른쪽 6', 590, 237, 1_100, 257),
      line('왼쪽 6', 30, 246, 560, 266),
      line('오른쪽 7', 590, 266, 1_100, 286),
      line('꼬리말', 495, 300, 820, 320),
    ]

    expect(await texts(lines)).toEqual([
      '머리말 왼쪽',
      '머리말 가운데',
      '머리말 오른쪽',
      '왼쪽 1',
      '왼쪽 2',
      '왼쪽 3',
      '왼쪽 4',
      '왼쪽 5',
      '왼쪽 6',
      '오른쪽 1',
      '오른쪽 2',
      '오른쪽 3',
      '오른쪽 4',
      '오른쪽 5',
      '오른쪽 6',
      '오른쪽 7',
      '꼬리말',
    ])
  })

  it('좌우 줄 높이가 맞아도 양쪽이 여러 줄의 넓은 글 덩어리면 단 순서로 읽는다', async () => {
    const lines = [0, 1, 2, 3].flatMap((row) => [
      line(`왼쪽 ${row + 1}`, 30, 100 + row * 30, 560, 120 + row * 30),
      line(`오른쪽 ${row + 1}`, 590, 101 + row * 30, 1_100, 121 + row * 30),
    ])

    expect(await texts(lines)).toEqual([
      '왼쪽 1',
      '왼쪽 2',
      '왼쪽 3',
      '왼쪽 4',
      '오른쪽 1',
      '오른쪽 2',
      '오른쪽 3',
      '오른쪽 4',
    ])
  })

  it('좁은 여백 양쪽 줄의 높이가 맞고 한쪽이 번호처럼 좁으면 행으로 읽는다', async () => {
    const lines = [
      line('2', 100, 140, 115, 160),
      line('첫째 항목', 145, 100, 800, 120),
      line('둘째 항목', 145, 140, 800, 160),
      line('1', 100, 100, 115, 120),
    ]

    expect(await texts(lines)).toEqual(['1', '첫째 항목', '2', '둘째 항목'])
  })

  it('카드 격자는 행 순서로 읽고 카드 안의 줄은 이어서 읽는다', async () => {
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

    expect(await texts(lines)).toEqual([
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
