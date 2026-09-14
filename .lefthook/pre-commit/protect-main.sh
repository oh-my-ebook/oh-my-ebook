#!/bin/sh

if [ "$(git symbolic-ref --quiet HEAD)" = "refs/heads/main" ]; then
  echo "main에서는 직접 커밋할 수 없습니다. 작업 브랜치를 사용하세요."
  exit 1
fi
