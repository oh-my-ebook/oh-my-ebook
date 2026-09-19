import { useRef, useState, type DragEvent } from 'react'

interface UsePageFileDropOptions {
  disabled?: boolean
  onFilesDropped(files: File[]): void
}

function hasFiles(event: DragEvent) {
  return event.dataTransfer.types.includes('Files')
}

export function usePageFileDrop({ disabled = false, onFilesDropped }: UsePageFileDropOptions) {
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const dragDepth = useRef(0)

  return {
    isDraggingFile,
    dropZoneProps: {
      // dragover/drop은 파일 여부와 상관없이 항상 preventDefault한다.
      // 그렇지 않으면 브라우저가 기본 동작(드롭한 링크·텍스트로 페이지 이동)을 실행해 앱을 이탈시킨다.
      onDragEnter(event: DragEvent) {
        event.preventDefault()
        if (disabled || !hasFiles(event)) return
        dragDepth.current += 1
        setIsDraggingFile(true)
      },
      onDragOver(event: DragEvent) {
        event.preventDefault()
      },
      onDragLeave(event: DragEvent) {
        // disabled 여부와 무관하게 감소시켜야, 드래그 도중 disabled로 바뀌어도
        // 카운터가 멈춰 강조 표시가 고착되지 않는다.
        if (!hasFiles(event) || dragDepth.current === 0) return
        dragDepth.current -= 1
        if (dragDepth.current === 0) setIsDraggingFile(false)
      },
      onDrop(event: DragEvent) {
        event.preventDefault()
        dragDepth.current = 0
        setIsDraggingFile(false)
        if (disabled || !hasFiles(event)) return
        onFilesDropped(Array.from(event.dataTransfer.files))
      },
    },
  }
}
