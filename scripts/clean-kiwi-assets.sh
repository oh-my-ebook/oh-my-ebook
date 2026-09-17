#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KIWI_DIR="$PROJECT_DIR/public/kiwi"

rm -rf "$KIWI_DIR"
echo "Kiwi 생성 자산을 삭제했습니다."