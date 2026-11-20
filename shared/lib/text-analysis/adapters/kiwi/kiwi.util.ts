import { SEARCH_TERM_TAGS } from './kiwi.const'
import type { KiwiSearchTerm, KiwiTextAnalyzer } from './kiwi.types'

export function normalizeText(analyzer: KiwiTextAnalyzer, text: string) {
  return text
    .split('\n')
    .map((line) => {
      const tokens = analyzer.tokenize(line)
      if (tokens.length === 0) return line
      const morphemes = tokens.map(({ str, tag }) => ({ form: str, tag }))
      return analyzer.joinSentence(morphemes).str
    })
    .join('\n')
}

export function extractSearchTerms(analyzer: KiwiTextAnalyzer, text: string): KiwiSearchTerm[] {
  const termFrequencies = new Map<string, number>()

  for (const { str: tokenText, tag } of analyzer.tokenize(text)) {
    const term = tokenText.trim()
    if (!term || !SEARCH_TERM_TAGS.has(tag)) continue
    termFrequencies.set(term, (termFrequencies.get(term) ?? 0) + 1)
  }

  return Array.from(termFrequencies, ([term, termFrequency]) => ({ term, termFrequency }))
}
