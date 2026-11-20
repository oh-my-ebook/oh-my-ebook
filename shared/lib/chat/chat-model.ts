export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatModel {
  streamResponse(options: {
    messages: readonly ChatMessage[]
    maxOutputTokens: number
    signal: AbortSignal
  }): AsyncIterable<string>
}
