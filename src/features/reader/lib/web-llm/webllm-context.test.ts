import { describe, expect, it } from 'vitest'
import { prepareContext, CONTEXT_WINDOW, RESPONSE_TOKENS, SAFETY_TOKENS } from './webllm-context'

const countTokens = (text: string) => Array.from(text).length
const question = {
  role: 'user' as const,
  content: '현재 질문과 <selected_quote>인용</selected_quote>',
}

describe('컨텍스트 예산', () => {
  it('짧은 입력은 시스템과 대화를 그대로 유지한다', () => {
    const result = prepareContext('시스템', [question], countTokens)
    expect(result.messages).toEqual([{ role: 'system', content: '시스템' }, question])
    expect(result.removedMessages).toBe(0)
    expect(result.error).toBeUndefined()
    expect(result.totalTokens).toBe(result.inputTokens + RESPONSE_TOKENS + SAFETY_TOKENS)
  })

  it('90%부터 오래된 질문과 답변을 함께 제외하고 최신 질문과 인용은 보존한다', () => {
    const history = [
      { role: 'user' as const, content: '오래된 질문'.repeat(800) },
      { role: 'assistant' as const, content: '오래된 답변'.repeat(800) },
      question,
    ]
    const result = prepareContext('시스템', history, countTokens)
    expect(result.messages).toEqual([{ role: 'system', content: '시스템' }, question])
    expect(result.removedMessages).toBe(2)
    expect(result.totalTokens).toBeLessThan(CONTEXT_WINDOW * 0.9)
    expect(history).toHaveLength(3)
  })

  it('예약 공간을 포함한 90% 경계에서 자동 정리를 시작한다', () => {
    const history = [
      { role: 'user' as const, content: '이전 질문' },
      { role: 'assistant' as const, content: '이전 답변' },
      question,
    ]
    const base = prepareContext('시스템', history, countTokens).totalTokens
    const below = Math.floor(CONTEXT_WINDOW * 0.9)
    const withPadding = (extra: number) => [
      {
        ...history[0],
        role: 'user' as const,
        content: '이전 질문' + '가'.repeat(below - base + extra),
      },
      ...history.slice(1),
    ]
    expect(prepareContext('시스템', withPadding(0), countTokens).removedMessages).toBe(0)
    expect(prepareContext('시스템', withPadding(1), countTokens).removedMessages).toBe(2)
  })

  it('긴 페이지는 유니코드와 시스템 지시를 보존하면서 예산 안으로 줄인다', () => {
    const system =
      '지시\n<page_context>\n' + '한글😀'.repeat(4000) + '\n</page_context>\n마지막 지시'
    const result = prepareContext(system, [question], countTokens)
    expect(result.totalTokens).toBeLessThanOrEqual(CONTEXT_WINDOW)
    expect(result.truncatedSources).toEqual(['페이지 본문'])
    expect(result.messages[0]?.content).toMatch(/^지시\n<page_context>\n한글😀/)
    expect(result.messages[0]?.content).toContain('</page_context>\n마지막 지시')
    expect(result.messages[0]?.content).not.toContain('\uFFFD')
    expect(result.messages.at(-1)).toEqual(question)
  })

  it('본문을 줄여도 책 정보가 길면 메타데이터도 줄인다', () => {
    const result = prepareContext(
      '<book_metadata>' +
        '책'.repeat(10000) +
        '</book_metadata>\n<page_context>본문</page_context>',
      [question],
      countTokens,
    )
    expect(result.truncatedSources).toEqual(['페이지 본문', '책 정보'])
    expect(result.totalTokens).toBeLessThanOrEqual(CONTEXT_WINDOW)
    expect(result.error).toBeUndefined()
  })

  it('최신 질문 자체가 너무 길면 자르지 않고 수정 안내를 반환한다', () => {
    const large = { role: 'user' as const, content: '질문'.repeat(CONTEXT_WINDOW) }
    const result = prepareContext('시스템', [large], countTokens)
    expect(result.error).toContain('질문을 줄이거나 인용문을 삭제')
    expect(result.messages.at(-1)).toEqual(large)
  })
})
