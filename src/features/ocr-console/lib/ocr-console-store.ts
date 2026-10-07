export interface OcrConsoleStore {
  request(
    command:
      | 'listBooks'
      | 'listOcrLines'
      | 'listOcrPages'
      | 'listSearchChunks'
      | 'listChunkSources'
      | 'listSearchTerms'
      | 'listSearchPostings'
      | 'getBookAnalysisStatus',
    payload?: unknown,
  ): Promise<unknown>
}
