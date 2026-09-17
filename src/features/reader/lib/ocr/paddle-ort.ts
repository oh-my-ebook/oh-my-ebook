const modulePath = '/vendor/ocr/onnxruntime/ort-wasm-simd-threaded.jsep.mjs'
const wasmPath = '/vendor/ocr/onnxruntime/ort-wasm-simd-threaded.jsep.wasm'

let moduleUrl: Promise<string> | undefined

export async function getPaddleWasmPaths() {
  moduleUrl ??= fetch(modulePath).then(async (response) => {
    if (!response.ok) {
      throw new Error('OCR 실행 파일을 불러오지 못했습니다.')
    }
    return URL.createObjectURL(
      new Blob([await response.arrayBuffer()], { type: 'text/javascript' }),
    )
  })

  return { mjs: await moduleUrl, wasm: wasmPath } as unknown as string
}
