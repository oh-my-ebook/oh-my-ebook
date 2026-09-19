import { useState, type DragEvent } from 'react'

interface UsePageFileDropOptions {
  disabled?: boolean
  onFilesDropped(files: File[]): void
}

function hasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer.types).includes('Files')
}

export function usePageFileDrop({ disabled = false, onFilesDropped }: UsePageFileDropOptions) {
  const [dragDepth, setDragDepth] = useState(0)

  return {
    isDraggingFile: dragDepth > 0,
    dropZoneProps: {
      onDragEnter(event: DragEvent) {
        if (disabled || !hasFiles(event)) return
        event.preventDefault()
        setDragDepth((depth) => depth + 1)
      },
      onDragOver(event: DragEvent) {
        if (disabled || !hasFiles(event)) return
        event.preventDefault()
      },
      onDragLeave(event: DragEvent) {
        if (disabled || !hasFiles(event)) return
        setDragDepth((depth) => Math.max(0, depth - 1))
      },
      onDrop(event: DragEvent) {
        if (disabled || !hasFiles(event)) return
        event.preventDefault()
        setDragDepth(0)
        onFilesDropped(Array.from(event.dataTransfer.files))
      },
    },
  }
}
