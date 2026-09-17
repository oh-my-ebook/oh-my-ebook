#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KIWI_DIR="$PROJECT_DIR/public/kiwi"
OCR_DIR="$PROJECT_DIR/public/vendor/ocr"
TEMP_DIR=""

DETECTION_URL="https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_det_onnx_infer.tar"
KOREAN_MODEL_BASE="https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx/resolve/5c6f574b8e2230adf4287b33e736d71b9fabd28e"
KIWI_MODEL_URL="https://github.com/bab2min/Kiwi/releases/download/v0.24.0/kiwi_model_v0.24.0_base.tgz"

download() {
  local url="$1"
  local output="$2"
  if [[ ! -s "$output" ]]; then
    curl --fail --location --retry 3 "$url" --output "$output"
  fi
}

cleanup() {
  if [[ -n "$TEMP_DIR" ]]; then
    rm -rf "$TEMP_DIR"
  fi
}

trap cleanup EXIT
mkdir -p "$KIWI_DIR/model" "$OCR_DIR/onnxruntime" "$OCR_DIR/paddleocr"

cp "$PROJECT_DIR/node_modules/kiwi-nlp/dist/kiwi-wasm.wasm" "$KIWI_DIR/kiwi-wasm.wasm"
ORT_DIR="$(find "$PROJECT_DIR/node_modules/.pnpm" -path '*/onnxruntime-web/dist' -type d -print -quit)"
if [[ -z "$ORT_DIR" ]]; then
  echo 'ONNX Runtime 자산을 찾지 못했습니다. pnpm install을 먼저 실행해 주세요.' >&2
  exit 1
fi
cp "$ORT_DIR/ort-wasm-simd-threaded.jsep.mjs" "$OCR_DIR/onnxruntime/"
cp "$ORT_DIR/ort-wasm-simd-threaded.jsep.wasm" "$OCR_DIR/onnxruntime/"

download "$DETECTION_URL" "$OCR_DIR/paddleocr/PP-OCRv5_mobile_det_onnx_infer.tar"

RECOGNITION_TAR="$OCR_DIR/paddleocr/korean_PP-OCRv5_mobile_rec_onnx_infer.tar"
if [[ ! -s "$RECOGNITION_TAR" ]]; then
  TEMP_DIR="$(mktemp -d)"
  MODEL_DIR="$TEMP_DIR/korean_PP-OCRv5_mobile_rec_onnx_infer"
  mkdir -p "$MODEL_DIR"
  download "$KOREAN_MODEL_BASE/inference.onnx?download=true" "$MODEL_DIR/inference.onnx"
  download "$KOREAN_MODEL_BASE/inference.yml?download=true" "$MODEL_DIR/inference.yml"
  tar -cf "$RECOGNITION_TAR" -C "$TEMP_DIR" "$(basename "$MODEL_DIR")"
fi

KIWI_FILES=(combiningRule.txt extract.mdl sj.morph cong.mdl nounchr.mdl)
for model_name in "${KIWI_FILES[@]}"; do
  if [[ ! -s "$KIWI_DIR/model/$model_name" ]]; then
    TEMP_DIR="${TEMP_DIR:-$(mktemp -d)}"
    KIWI_ARCHIVE="$TEMP_DIR/kiwi-model.tgz"
    download "$KIWI_MODEL_URL" "$KIWI_ARCHIVE"
    tar -xzf "$KIWI_ARCHIVE" -C "$TEMP_DIR"
    KIWI_SOURCE="$(find "$TEMP_DIR" -type f -name cong.mdl -print -quit)"
    cp "$(dirname "$KIWI_SOURCE")/$model_name" "$KIWI_DIR/model/$model_name"
  fi
done
