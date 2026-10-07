export interface BookMetadata {
  author?: string
  keywords?: string
  publisher?: string
  subject?: string
  title: string
}

export type BookAnalysisStatus = 'analyzing' | 'ready' | 'failed'
