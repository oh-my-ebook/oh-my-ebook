import { SEARCH_TERM_TAGS } from './const'
import type { KiwiTools, KiwiSearchTerm } from './kiwi.types'

export function normalizeText(tool: KiwiTools, text: string) {
  return text
    .split('\n')
    .map((line) => {
      const tokens = tool.tokenize(line)

      if (!tokens.length) return line
      return tool.joinSent(tokens.map((token) => ({ form: token.str, tag: token.tag }))).str
    })
    .join('\n')
}

export function extractSearchTerms(tool: KiwiTools, text: string): KiwiSearchTerm[] {
  const frequencies = new Map<string, number>()

  tool.tokenize(text).forEach(({ str, tag }) => {
    const term = str.trim()

    if (!term || !SEARCH_TERM_TAGS.has(tag)) return
    frequencies.set(term, (frequencies.get(term) ?? 0) + 1)
  })

  return Array.from(frequencies, ([term, termFrequency]) => ({ term, termFrequency }))
}
