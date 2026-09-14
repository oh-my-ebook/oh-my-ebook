#!/bin/sh

while read -r local_ref local_oid remote_ref remote_oid; do
  if [ "$remote_ref" = "refs/heads/main" ]; then
    echo "main으로 직접 push할 수 없습니다. PR을 사용하세요."
    exit 1
  fi
done
