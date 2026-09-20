const MULTI_QUOTE_PREFIX = 'multi-quote:'

export function encodeQuoteTexts(quoteTexts: readonly string[]) {
  return `${MULTI_QUOTE_PREFIX}${JSON.stringify(quoteTexts)}`
}

export function decodeQuoteTexts(encodedText: string) {
  if (!encodedText.startsWith(MULTI_QUOTE_PREFIX)) return [encodedText]

  try {
    const quoteTexts: unknown = JSON.parse(encodedText.slice(MULTI_QUOTE_PREFIX.length))
    return Array.isArray(quoteTexts) && quoteTexts.every((text) => typeof text === 'string')
      ? quoteTexts
      : [encodedText]
  } catch {
    return [encodedText]
  }
}
