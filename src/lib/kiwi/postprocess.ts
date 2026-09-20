export interface KiwiTextTools {
  tokenize(line: string): Array<{ str: string; tag: string }>
  joinSent(morphs: Array<{ form: string; tag: string }>): { str: string }
}

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
