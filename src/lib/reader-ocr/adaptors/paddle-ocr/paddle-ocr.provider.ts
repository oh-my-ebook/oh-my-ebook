type PaddleOcr = Awaited<
  ReturnType<(typeof import('@paddleocr/paddleocr-js'))['PaddleOCR']['create']>
>

export class PaddleOcrProvider {
  private paddleOCrPromise: Promise<PaddleOcr> | undefined

  getInstance(): Promise<PaddleOcr> {
    if (this.paddleOCrPromise) return this.paddleOCrPromise

    const wasmPaths = this.getWasmPath()
    const instancePromise = import('@paddleocr/paddleocr-js')
      .then(({ PaddleOCR }) =>
        PaddleOCR.create({
          worker: true,
          textDetectionModelName: 'PP-OCRv5_mobile_det',
          textDetectionModelAsset: {
            url: '/vendor/ocr/paddleocr/PP-OCRv5_mobile_det_onnx_infer.tar',
          },
          textRecognitionModelName: 'korean_PP-OCRv5_mobile_rec',
          textRecognitionModelAsset: {
            url: '/vendor/ocr/paddleocr/korean_PP-OCRv5_mobile_rec_onnx_infer.tar',
          },
          textRecognitionBatchSize: 8,
          ortOptions: { backend: 'wasm', wasmPaths, simd: true },
        }),
      )
      .catch((error: unknown) => {
        if (this.paddleOCrPromise === instancePromise) {
          this.paddleOCrPromise = undefined
        }

        throw error
      })

    this.paddleOCrPromise = instancePromise
    return instancePromise
  }

  abandon(instancePromise: Promise<PaddleOcr>) {
    if (this.paddleOCrPromise === instancePromise) {
      this.paddleOCrPromise = undefined
    }

    // 취소된 마지막 요청의 Worker는 초기화가 끝난 뒤에도 정리한다.
    void instancePromise.then((instance) => instance.dispose()).catch(() => undefined)
  }

  private getWasmPath(): string {
    return import.meta.env.DEV ? '/src/assets/vendor/ocr/runtime/' : '/vendor/ocr/runtime/'
  }
}
