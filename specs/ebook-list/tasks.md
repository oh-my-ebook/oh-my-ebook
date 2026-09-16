# Ebook 책장 구현 작업

**입력 문서**: [spec.md](./spec.md), [plan.md](./plan.md)  
**선행 조건**: `specs/basic-pdf-reader/tasks.md`의 T009~T028 완료

## 진행 규칙

- 한 담당자는 한 번에 작업 하나만 수행한다. 테스트를 먼저 작성해 의도한 이유로 실패하는지
  확인하고, 같은 작업 안에서 최소 구현과 집중 검증까지 마친 뒤 결과를 보고하고 멈춘다.
- `[P]` 작업은 선행 작업이 끝났을 때 다른 담당자가 동시에 진행할 수 있다. 같은 담당자는 맡은
  작업을 번호 순서대로 처리한다.
- 공용 파일인 `package.json`, `pnpm-lock.yaml`, `src/app.tsx`,
  `src/features/ebook-list/hooks/use-ebook-library.ts`, `e2e/ebook-list.spec.ts`는 통합 담당자만
  수정한다. `src/index.css`는 T002가 끝난 뒤 책장 UI 담당자만 수정한다. 병렬 담당자는 공개 props와
  콜백으로 연결 가능한 모듈을 만든다.
- shadcn 생성 파일은 설정 담당자가 한 번만 추가한다. 다른 담당자는 `src/components/ui/`를
  수정하지 않는다.
- 각 작업은 명시된 집중 검사를 통과한 뒤 체크한다. 전체 `pnpm check`, `pnpm build`,
  `pnpm test:e2e`는 마지막 통합 작업에서 실행한다.
- 구현 중 요구사항이 달라지면 `spec.md`와 `plan.md`를 먼저 갱신하고 작업을 다시 나눈다.

## 담당 영역

| 영역        | 전용 파일                                                         | 다른 영역과 병렬 가능한 시점 |
| ----------- | ----------------------------------------------------------------- | ---------------------------- |
| 통합        | `package.json`, 설정, `app.tsx`, `use-ebook-library.ts`, 공용 E2E | 항상 한 명만 담당            |
| 저장소      | `ebook-types.ts`, `ebook-store-client.ts`, `ebook-db.worker.ts`   | 기반 타입 완료 후            |
| 업로드      | `pdf-import.ts`, `pdf-upload.tsx`                                 | 공통 PDF 모듈 완료 후        |
| 책장 UI     | `book-card.tsx`, `ebook-shelf.tsx`, `src/index.css`               | 기반 타입 완료 후            |
| Reader 연결 | `reader.tsx`, `use-pdf-document.ts`, `ebook-reader-page.tsx`      | 기본 Reader 완료 후          |
| 삭제        | `delete-book-dialog.tsx`                                          | shadcn 컴포넌트 추가 후      |

---

## Phase 1: 설정

**목적**: SQLite WASM이 개발·미리보기·배포 환경에서 실행될 기반과 공통 UI를 준비한다.

- [ ] [T001] `package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `vercel.json`에
      `@sqlite.org/sqlite-wasm`, Vite 사전 번들 제외, dev·preview·Vercel COOP/COEP 헤더를 추가하고
      `pnpm build`와 응답 헤더 확인으로 설정을 검증한다.
- [ ] [T002] T001 후 `pnpm dlx shadcn@latest add alert-dialog card empty progress --dry-run`과
      `--diff`를 확인하고 실제 사용하는 컴포넌트만 `src/components/ui/alert-dialog.tsx`, `card.tsx`,
      `empty.tsx`, `progress.tsx`에 추가한다. 기존 `button.tsx`를 덮어쓰지 않고 `pnpm typecheck`로 생성
      코드를 검증한다.
- [ ] [T003] [P] `e2e/fixtures/ebook/`에 메타데이터가 있는 PDF, 없는 PDF, 회전된 1페이지 PDF,
      암호 PDF, 손상 파일과 동일 내용·다른 파일명 fixture를 추가하고 페이지 수·메타데이터·해시가
      의도와 같은지 검증한다. 테스트 실행 중 fixture를 생성하지 않는다.
- [ ] [T004] 기본 Reader 완료 후 기존 테스트를 먼저 실행하고
      `src/features/reader/lib/pdf-document.ts`를 `src/lib/pdf/pdf-document.ts`로 옮긴 뒤
      `src/features/reader/hooks/use-pdf-document.ts`와 관련 테스트 import만 갱신한다. 동작을 바꾸지
      않고 Reader 집중 테스트와 `pnpm typecheck`를 통과시킨다.

**체크포인트**: 브라우저 격리 헤더, SQLite 의존성, 공통 UI와 PDF 모듈을 사용할 수 있다.

---

## Phase 2: 공통 기반

**목적**: 각 사용자 스토리가 공유하는 타입, 브라우저 저장 API와 최소 책장 셸을 만든다.

- [ ] [T005] `src/features/ebook-list/lib/ebook-store-client.test.ts`에 요청 ID 매칭, transferable
      원본 전달, Worker 오류 매핑, 종료 시 대기 요청 정리와 잠금 재시도 한도 테스트를 먼저 작성해
      실패를 확인한다. `src/features/ebook-list/ebook-types.ts`와
      `src/features/ebook-list/lib/ebook-store-client.ts`에 최소 메시지 타입과 클라이언트를 구현하고
      해당 테스트를 통과시킨다.
- [ ] [T006] [P] `src/features/ebook-list/lib/storage-manager.test.ts`와
      `src/features/ebook-list/lib/format-bytes.test.ts`에 OPFS 지원 판별, `persisted()` 재사용,
      `persist()` 거부, `estimate()` 실패, 잔여량 하한과 바이트 표시 테스트를 먼저 작성해 실패를
      확인한다. `storage-manager.ts`와 `format-bytes.ts`를 브라우저 기본 API만으로 구현하고 집중
      테스트를 통과시킨다.
- [ ] [T007] T005 후 `src/features/ebook-list/components/ebook-library.test.tsx`에 초기 로딩 중 조작
      비활성화, 빈 상태, DB 초기화 실패와 재시도 테스트를 fake store로 먼저 작성해 실패를 확인한다.
      `ebook-library.tsx`와 `src/features/ebook-list/hooks/use-ebook-library.ts`에 목록 초기화만 구현하고
      컴포넌트 테스트를 통과시킨다. 실제 Worker 연결과 업로드는 추가하지 않는다. (FR-001, FR-002,
      FR-016)
- [ ] [T008] T005와 T007 후 `e2e/ebook-list.spec.ts`에 실제 `/` 진입 시 OPFS DB 초기화와 빈 책장
      표시 테스트를 먼저 작성해 실패를 확인한다. `src/features/ebook-list/lib/ebook-db.worker.ts`,
      `src/pages/ebook-list-page.tsx`, `src/app.tsx`에 `initialize`, 스키마 `0 → 1`, 최근 업로드 순
      `listBooks`와 `/` 라우트만 연결하고 집중 E2E, `pnpm typecheck`를 통과시킨다. (FR-001, FR-002,
      FR-012, FR-015)

**체크포인트**: 빈 책장이 실제 SQLite OPFS DB를 열며, 이후 `[P]` 사용자 스토리 모듈을 병렬로
개발할 수 있다.

---

## Phase 3: 사용자 스토리 1, PDF를 내 책장에 추가한다 (P1)

**목표**: PDF를 검증하고 메타데이터와 첫 페이지 표지를 만들어 원본과 함께 원자적으로 저장한다.

**독립 검증**: 빈 책장에 유효한 PDF를 업로드해 표지와 책 정보가 나타나고, 새로고침 후에도 같은
책이 복원되는지 확인한다.

- [ ] [T009] [P] [US1] `src/features/ebook-list/lib/pdf-import.test.ts`에 SHA-256 내용 식별,
      제목·지은이·출판사 정규화, 파일명 제목 대체, `Producer` 제외, 손상·암호·0페이지 PDF 오류
      테스트를 먼저 작성해 실패를 확인한다. `src/features/ebook-list/lib/pdf-import.ts`에 PDF.js와
      브라우저 `crypto.subtle`을 사용한 문서 분석을 구현하고 집중 테스트를 통과시킨다. (FR-004,
      FR-006, FR-009, FR-010)
- [ ] [T010] T009 후 [US1] `src/features/ebook-list/lib/pdf-import.test.ts`에 첫 페이지 회전·비율,
      최대 너비 480px, WebP와 PNG 대체, 렌더 실패 fallback, PDF.js 문서·canvas 정리 테스트를 먼저
      추가해 실패를 확인한다. `pdf-import.ts`에 표지 생성을 구현하고 집중 테스트를 통과시킨다.
      (FR-007, FR-008)
- [ ] [T011] [P] [US1] `src/features/ebook-list/components/pdf-upload.test.tsx`에 접근 가능한 다중
      파일 선택, 파일별 대기·진행·성공·실패 상태와 처리 중 재선택 방지 테스트를 먼저 작성해 실패를
      확인한다. `src/features/ebook-list/components/pdf-upload.tsx`를 props와 콜백만으로 구현하고 집중
      테스트를 통과시킨다. (FR-003, FR-005, FR-026)
- [ ] [T012] [P] [US1] `src/features/ebook-list/components/storage-summary.test.tsx`에 사용량·예상
      할당량·잔여량, 추정치 안내, 조회 실패와 재시도 테스트를 먼저 작성해 실패를 확인한다.
      `src/features/ebook-list/components/storage-summary.tsx`를 구현하고 집중 테스트를 통과시킨다.
      (FR-031, FR-032)
- [ ] [T013] T006, T009~T012 후 [US1] `src/features/ebook-list/components/ebook-library.test.tsx`에
      첫 업로드의 영구 저장 요청, 거부 시 업로드 비활성화, 서버 비동기화 안내, 파일별 순차 처리,
      최신 잔여량 선검사와 완료·실패 후 용량 갱신 테스트를 먼저 추가해 실패를 확인한다.
      `use-ebook-library.ts`와 `ebook-library.tsx`에 업로드 흐름을 연결하고 집중 테스트를 통과시킨다.
      (FR-005, FR-012, FR-015, FR-017, FR-032, FR-034)
- [ ] [T014] T005, T008, T013 후 [US1] `e2e/ebook-list.spec.ts`에 유효한 PDF 업로드, 내용 중복,
      원자적 쓰기 실패, 새로고침 복원과 목록에서 원본 BLOB을 읽지 않는 흐름을 먼저 추가해 실패를
      확인한다. `ebook-db.worker.ts`에 `addBook` 트랜잭션과 `content_hash` UNIQUE 처리를 구현하고 집중
      E2E를 통과시킨다. (FR-006, FR-012~FR-014, SC-001, SC-003)
- [ ] [T015] T010, T014 후 [US1] `src/features/ebook-list/components/ebook-library.test.tsx`와
      `e2e/ebook-list.spec.ts`에 메타데이터 없음, 여러 파일 일부 실패, 손상·암호 PDF, 표지 fallback과
      재생성, 예상 공간 부족과 실제 쓰기 실패, 브라우저 영구 저장 거부를 먼저 추가해 실패를 확인한다.
      `src/features/ebook-list/lib/pdf-import.ts`, `src/features/ebook-list/hooks/use-ebook-library.ts`,
      `src/features/ebook-list/lib/ebook-db.worker.ts`에 `updateCover`를 포함한 누락된 최소 오류 처리를
      구현하고 집중 테스트를 통과시킨다. (FR-004, FR-005, FR-008, FR-010, FR-014~FR-016, FR-034,
      SC-002, SC-005, SC-009, SC-010)
- [ ] [T016] T014 후 [US1] `e2e/ebook-persistence.spec.ts`에 임시 user data 디렉터리의 persistent
      context를 닫고 같은 디렉터리로 다시 연 뒤 책과 표지가 복원되는 테스트를 먼저 작성해 실패를
      확인한다. 필요한 복원 결함만 `ebook-db.worker.ts`와 `ebook-store-client.ts`에서 수정하고 집중
      E2E를 통과시킨다. (FR-013, SC-003)

**체크포인트**: 사용자 스토리 1을 단독으로 실행해 업로드와 복원을 검증할 수 있다.

---

## Phase 4: 사용자 스토리 2, 저장된 책과 독서 진행률을 확인한다 (P1)

**목표**: 저장된 책을 목록에서 확인하고 마지막 페이지부터 열며 페이지 변경을 저장한다.

**독립 검증**: 100페이지 책의 12페이지를 저장한 뒤 책장과 재진입 Reader에서 같은 위치를
확인한다.

- [ ] [T017] [P] [US2] `src/features/ebook-list/components/book-card.test.tsx`에 표지·제목·지은이·
      출판사, 읽지 않음·전체 페이지, 현재/전체 페이지, 긴 정보의 전체 접근과 키보드 열기 테스트를
      먼저 작성해 실패를 확인한다. `src/features/ebook-list/components/book-card.tsx`에 정적 카드와
      열기 콜백만 구현하고 집중 테스트를 통과시킨다. (FR-011, FR-018, FR-023, FR-026)
- [ ] [T018] [P] [US2] 기본 Reader 완료 후 `src/features/reader/hooks/use-pdf-document.test.ts`와
      `src/features/reader/components/reader.test.tsx`에 `Uint8Array` 원본, `initialPage`, 범위 밖 초기값,
      `onPageChange` 테스트를 먼저 추가해 실패를 확인한다. `use-pdf-document.ts`, `reader.tsx`,
      `src/lib/pdf/pdf-document.ts`의 공개 API를 최소 확장하고 Reader 집중 테스트를 통과시킨다.
      (FR-019~FR-022)
- [ ] [T019] T005, T018 후 [US2] `src/pages/ebook-reader-page.test.tsx`에 책 로딩, 저장된 초기
      페이지, 없는 책, 원본 읽기 실패, 빠른 페이지 이동의 마지막 값 저장, `visibilitychange` flush와
      진행률 쓰기 실패 후 독서 유지 테스트를 fake store로 먼저 작성해 실패를 확인한다.
      `src/pages/ebook-reader-page.tsx`를 구현하고 페이지 테스트를 통과시킨다. (FR-020, FR-021,
      FR-037)
- [ ] [T020] T014, T017, T019 후 [US2] `e2e/ebook-reader-progress.spec.ts`에 책 열기, 읽지 않음,
      페이지 이동 즉시 저장, 범위 밖 저장값의 1페이지 복구와 DB 정정, 책장 복귀와 마지막 페이지
      재진입 테스트를 먼저 작성해 실패를 확인한다. `ebook-db.worker.ts`에 `getBook`, 범위 검사
      `updateProgress`를 추가하고 `src/app.tsx`, `ebook-library.tsx`, `ebook-reader-page.tsx`에
      `/books/:bookId` 흐름을 연결해 집중 E2E를 통과시킨다. (FR-018~FR-022, SC-004)
- [ ] [T021] T006, T017 후 [US2] `src/features/ebook-list/components/ebook-library.test.tsx`에 수동
      새로고침 성공 시 목록·용량 교체, 실패 시 기존 목록 유지와 재시도 테스트를 먼저 추가해 실패를
      확인한다. `src/features/ebook-list/hooks/use-ebook-library.ts`,
      `src/features/ebook-list/components/ebook-library.tsx`,
      `src/features/ebook-list/components/storage-summary.tsx`에 새로고침을 연결하고 집중 테스트를
      통과시킨다. (FR-032, FR-036)
- [ ] [T022] T020, T021 후 [US2] `e2e/ebook-multitab.spec.ts`에 두 탭에서 서로 다른 페이지를
      저장한 뒤 마지막 성공 커밋과 수동 새로고침 결과를 확인하는 테스트를 먼저 작성해 실패를
      확인한다. `ebook-db.worker.ts`와 `ebook-store-client.ts`에 짧은 트랜잭션, statement 정리와
      제한된 `SQLITE_BUSY` 재시도만 보완하고 집중 E2E를 통과시킨다. (FR-035, FR-036, FR-038,
      SC-011)

**체크포인트**: 사용자 스토리 2를 단독으로 실행해 목록, Reader와 진행률 복원을 검증할 수 있다.

---

## Phase 5: 사용자 스토리 3, 책장처럼 책을 둘러본다 (P2)

**목표**: 반응형 책장과 제한된 3D 표지를 제공하되 모든 입력 방식에서 같은 기능을 유지한다.

**독립 검증**: 정밀 포인터, 키보드, 터치와 동작 감소 환경에서 같은 책을 확인하고 열 수 있다.

- [ ] [T023] [P] [US3] T017 후 `src/features/ebook-list/components/ebook-shelf.test.tsx`에 여러 책의
      접근 순서와 하나의 카드 단위 인식 테스트를 먼저 작성해 실패를 확인한다.
      `src/features/ebook-list/components/ebook-shelf.tsx`와 `src/index.css`에 320px 한 열을 포함한
      Grid, 라이트·다크 책장 토큰을 구현하고 집중 테스트와 `pnpm typecheck`를 통과시킨다. (FR-023,
      FR-027)
- [ ] [T024] T017, T023 후 [US3] `src/features/ebook-list/components/book-card.test.tsx`에 포인터
      위치별 최대 6도 제한, pointerleave 복귀, 정밀 포인터가 아닌 환경과
      `prefers-reduced-motion`의 정적 동작 테스트를 먼저 추가해 실패를 확인한다.
      `src/features/ebook-list/components/book-card.tsx`에서 DOM ref와 CSS 변수만 갱신하고
      `src/index.css`에 합성 가능한 transform과 motion 규칙을 추가해 집중 테스트를 통과시킨다.
      (FR-024, FR-025)
- [ ] [T025] T023, T024 후 [US3] `e2e/ebook-list.spec.ts`에 정밀 포인터 3D 복귀, 키보드 전용
      열기, reduced motion와 320px viewport 흐름을 먼저 추가해 실패를 확인한다. `ebook-shelf.tsx`,
      `book-card.tsx`, `src/index.css`의 재현된 결함만 수정하고 대표 책장 스냅샷을 직접 검토한다.
      브라우저 메뉴에서 실제 200% 확대도 확인한 뒤 집중 E2E를 통과시킨다. (FR-025~FR-027,
      SC-006, SC-007)

**체크포인트**: 사용자 스토리 3을 단독으로 실행해 책장 표현과 대체 입력을 검증할 수 있다.

---

## Phase 6: 사용자 스토리 4, 필요 없는 책을 삭제한다 (P2)

**목표**: 한 권의 모든 로컬 데이터를 확인 후 삭제하고 여러 탭의 오래된 상태를 안전하게 다룬다.

**독립 검증**: 두 권 중 한 권을 삭제한 뒤 해당 데이터만 사라지고 취소·실패에서는 그대로
유지되는지 확인한다.

- [ ] [T026] [P] [US4] `src/features/ebook-list/components/delete-book-dialog.test.tsx`에 책 제목과
      삭제 범위·복구 불가 안내, 취소 시 무변경과 포커스 복원, 진행·실패·재시도 테스트를 먼저 작성해
      실패를 확인한다. `src/features/ebook-list/components/delete-book-dialog.tsx`를 props와 콜백만으로
      구현하고 집중 테스트를 통과시킨다. (FR-028, FR-030)
- [ ] [T027] T014, T017, T026 후 [US4] `src/features/ebook-list/components/ebook-library.test.tsx`와
      `e2e/ebook-list.spec.ts`에 한 권 삭제 성공·취소·실패, 다른 책 유지와 삭제 후 용량 갱신 테스트를
      먼저 추가해 실패를 확인한다. `src/features/ebook-list/lib/ebook-db.worker.ts`에 조건부
      `deleteBook`을 추가하고 `src/features/ebook-list/hooks/use-ebook-library.ts`,
      `src/features/ebook-list/components/book-card.tsx`,
      `src/features/ebook-list/components/ebook-library.tsx`에 삭제 흐름을 연결해 집중 테스트와 E2E를
      통과시킨다. (FR-028~FR-033, SC-008)
- [ ] [T028] T022, T027 후 [US4] `e2e/ebook-multitab.spec.ts`에 오래된 탭의 열기·재삭제 차단,
      열린 Reader에서 삭제 감지 후 진행률 저장 중단, 현재 메모리 문서 유지와 화면 이탈 후 미복원을
      먼저 추가해 실패를 확인한다. `ebook-reader-page.tsx`, `ebook-store-client.ts`,
      `ebook-db.worker.ts`에 조건부 UPDATE 0행의 `deleted` 처리만 보완하고 집중 E2E를 통과시킨다.
      (FR-037~FR-039, SC-011, SC-012)

**체크포인트**: 사용자 스토리 4를 단독으로 실행해 삭제와 다중 탭 경계를 검증할 수 있다.

---

## Phase 7: 통합과 마무리

**목적**: 병렬 작업을 공용 화면에 합치고 전체 요구사항과 배포 환경을 검증한다.

- [ ] [T029] T015, T020, T021, T025, T027 후
      `src/features/ebook-list/components/ebook-library.test.tsx`에 업로드·목록·용량·새로고침·삭제를
      함께 사용하는 통합 테스트를 먼저 추가해 실패를 확인한다. `ebook-library.tsx`,
      `use-ebook-library.ts`, `ebook-list-page.tsx`에서 병렬 모듈을 조합하고 중복 상태나 임시 연결 코드를
      제거한 뒤 집중 테스트를 통과시킨다.
- [ ] [T030] T016, T022, T028, T029 후 `e2e/ebook-list.spec.ts`,
      `e2e/ebook-reader-progress.spec.ts`, `e2e/ebook-multitab.spec.ts`,
      `e2e/ebook-persistence.spec.ts`를 함께 실행해 SC-001~SC-012의 정상·오류·경계 흐름을 검증한다.
      발견한 결함은 각 테스트에 재현을 먼저 추가한 뒤 관련 `src/features/ebook-list/` 또는
      `src/pages/` 파일에서만 수정한다.
- [ ] [T031] T030 후 `pnpm check`, `pnpm build`, `pnpm test:e2e`를 실행하고 `pnpm preview`에서
      `crossOriginIsolated`, SQLite Worker 초기화, PDF 업로드·reload·Reader·삭제를 직접 확인한다.
      `package.json`, `vite.config.ts`, `vercel.json`은 검증에서 확인된 문제만 수정한다.
- [ ] [T032] T031 후 `specs/ebook-list/spec.md`의 FR-001부터 FR-039와 SC-001부터 SC-012를
      `specs/ebook-list/tasks.md` 완료 항목에 대조한다. `git status`로 검증 대상 변경을 확인하고 실제로
      완료된 작업만 체크한 뒤 변경 파일, 구현 내용, 테스트 결과와 추천 커밋 메시지를 보고한다.

---

## 의존 관계와 병렬 실행

### 단계 의존 관계

1. Phase 1은 기본 Reader 완료 후 시작한다. T003은 T001·T002와 병렬 가능하고 T004는 Reader 파일을
   담당하는 한 명만 수행한다.
2. Phase 2는 T001·T002·T004 후 시작한다. T005와 T006은 서로 다른 파일에서 병렬 진행하고,
   T007은 T005의 공통 타입을 사용한 뒤 T008에서 합친다.
3. T008 후 다음 작업 묶음을 서로 다른 담당자가 병렬로 시작할 수 있다.
   - 업로드 담당: T009 → T010, T011, T012
   - 책장 UI 담당: T017 → T023 → T024
   - Reader 담당: T018 → T019
   - 삭제 담당: T026
   - 저장소 담당: 각 스토리 통합 시 T014, T020, T022, T027 순으로 지원
4. 공용 `use-ebook-library.ts`를 수정하는 T013, T021, T027, T029는 통합 담당자가 번호 순서대로
   수행한다. 서로 병렬 실행하지 않는다.
5. T028은 Reader와 삭제 흐름이 모두 끝난 뒤, Phase 7은 선택한 모든 사용자 스토리가 끝난 뒤
   시작한다.

### 병렬 배정 예시

```text
담당자 A (통합)       T001 → T002 → T007 → T008 → T013 → T014 → T015 → T020 → T021 → T025 → T027 → T028 → T029
담당자 B (저장소)     T005 → T022
담당자 C (업로드/UI)  T003 → T009 → T010 → T011 → T012 → T016
담당자 D (표시/Reader) T004 → T017 → T018 → T019 → T023 → T024
가용 담당자 (삭제)    T026
```

실제 배정에서는 한 작업의 선행 조건이 끝나지 않았으면 같은 담당 영역의 다음 작업으로 건너뛰지
않고, 선행 조건이 없는 다른 `[P]` 작업을 맡는다. 공용 파일 수정이 필요한 작업은 통합 담당자에게
인계한다.

## 요구사항 추적

| 범위                       | 주요 작업                          |
| -------------------------- | ---------------------------------- |
| 업로드·검증·중복           | T009~T015                          |
| 표지·서지 정보             | T009, T010, T015, T017             |
| OPFS·SQLite·영구 저장·복원 | T001, T005부터 T008, T013부터 T016 |
| Reader·진행률              | T018~T022                          |
| 책장·3D·접근성             | T017, T023~T025                    |
| 삭제·공간 회수             | T012, T026~T028                    |
| 다중 탭·수동 동기화        | T021, T022, T028                   |
| 전체 완료 기준             | T029~T032                          |
