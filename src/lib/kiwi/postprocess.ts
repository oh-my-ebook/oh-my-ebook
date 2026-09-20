export interface KiwiTextTools {
  tokenize(line: string): Array<{ str: string; tag: string }>
  joinSent(morphs: Array<{ form: string; tag: string }>): { str: string }
}

export interface KiwiSearchTerm {
  term: string
  termFrequency: number
}

const SEARCH_TERM_TAGS = new Set(['NNG', 'NNP', 'NNB', 'NR', 'NP', 'VV', 'VA', 'MAG', 'SL', 'SN'])

export function postprocessKiwiText(kiwi: KiwiTextTools, text: string) {
  return text
    .split('\n')
    .map((line) => {
      const tokens = kiwi.tokenize(line)
      return tokens.length
        ? kiwi.joinSent(tokens.map((token) => ({ form: token.str, tag: token.tag }))).str
        : line
    })
    .join('\n')
}

export function extractSearchTerms(kiwi: KiwiTextTools, text: string): KiwiSearchTerm[] {
  const frequencies = new Map<string, number>()

  kiwi.tokenize(text).forEach(({ str, tag }) => {
    const term = str.trim()
    if (!term || !SEARCH_TERM_TAGS.has(tag)) return
    frequencies.set(term, (frequencies.get(term) ?? 0) + 1)
  })

  return Array.from(frequencies, ([term, termFrequency]) => ({ term, termFrequency }))
}
