# 기본 PDF Reader 구현 작업

## 병렬 진행 규칙

- PDF 첫 페이지 표시(T001~T008)는 네 섹션이 함께 사용하는 완료된 기반이다.
- 섹션 1~4는 서로 선행 관계가 없으며 각 섹션을 한 명에게 배정해 동시에 진행한다. 담당자는 한 섹션만 맡고, 섹션 안의 작업은 번호 순서대로 진행한다.
- 각 담당자는 화면 연결 작업 전까지 지정된 기능 파일·테스트·해당 섹션의 fixture와 UI 컴포넌트를 수정할 수 있다. 섹션 마지막의 화면 연결 작업에서는 공용 구현 파일인 `reader.tsx`, `reader-toolbar.tsx` 중 필요한 파일과 섹션별 Reader 연결 테스트만 수정할 수 있다. `app.tsx`, `app.test.tsx`, `e2e/app.spec.ts`, `e2e/basic-pdf-reader.spec.ts`는 통합 담당자만 수정한다.
- 다른 섹션의 미완료 모듈을 import하지 않는다. 섹션별 컴포넌트는 props와 콜백으로 상태를 주고받고, 순수 계산은 섹션별 `lib` 파일에 둔다.
- 화면 연결은 해당 섹션만 공통 기반에 연결하는 브랜치별 미리보기다. 기능 구현과 화면 연결을 별도 커밋으로 남기고, `pnpm dev`에서 조작이 보이고 동작하는지 확인한다. 자리 표시자나 다른 섹션의 임시 구현은 추가하지 않는다.
- shadcn CLI가 `package.json`이나 `pnpm-lock.yaml` 변경을 요구하면 해당 섹션에 포함한다. 병합 시 충돌한 의존성 파일은 통합 담당자가 공식 CLI를 한 번 더 실행해 정리한다.
- `[P]`는 다른 섹션과 병렬로 진행할 수 있다는 표시다. 섹션별 집중 테스트와 화면 연결 확인이 끝나면 인계한다. 통합 담당자는 페이지 탐색 → 보기 전환 → 크기 조절 → 보조 패널 순서로 병합하고, `reader.tsx`와 `reader-toolbar.tsx`의 예상 충돌을 해결한 뒤 통합 작업(T025~T028)을 순서대로 수행한다.

## PDF 첫 페이지 표시

**완료 기준:** 텍스트·스캔 PDF의 첫 페이지를 원본 비율과 높이 맞춤으로 한 화면 안에 표시한다. 폭이 남으면 가로 중앙에 배치하고 자동 맞춤에서는 스크롤을 만들지 않는다. 문서·페이지 표시 실패에서 재시도할 수 있고, 초기 화면을 실제 PDF와 worker로 검증한다. 탐색·보기 전환·크기 조절·패널 버튼은 아직 표시하지 않는다.

- [x] [T001] `package.json`, `pnpm-lock.yaml`에 `pnpm add pdfjs-dist`로 의존성을 추가하고 설치한 버전의 Node 요구사항을 확인한다. 버전이나 `--save-exact`를 지정하지 않는다.
- [x] [T002] `public/samples/basic-reader.pdf`에 직접 작성한 세로 텍스트 PDF 5장, `e2e/fixtures/pdf/scanned.pdf`에 이미지로만 된 세로 PDF 5장을 준비한다. 한글 폰트 포함, 페이지별 고유 번호·도형, 페이지 수·크기와 스캔 파일의 텍스트 부재를 확인한다. 테스트 실행 중 생성하지 않는 정적 파일로 준비한다.
- [x] [T003] `src/index.css`의 기존 테마 토큰을 확인하고 필요한 토큰만 보완한다. `src/components/ui/`에 현재 로딩·오류 화면에 필요한 Skeleton·Alert와 의존 컴포넌트만 공식 CLI로 추가한다. Button은 재사용하고 생성 코드의 Base UI API·의미 토큰·접근성·포맷을 검토한다.
- [x] [T004] `src/features/reader/hooks/use-pdf-document.test.ts`에 문서 로딩·재시도·페이지 크기 조회 실패·URL 변경·늦은 완료와 오류·StrictMode·unmount 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/lib/pdf-document.ts`, `src/features/reader/hooks/use-pdf-document.ts`에 같은 패키지의 worker `?url` 설정, PDF 열기·회전 적용 크기 조회·해제를 구현한다. 손상·암호 필요 문서는 로딩을 끝내고 오류로 처리한다. 이전 응답을 무시하고 `destroy()` 실패도 처리한다. PDF 모듈 경계의 Promise를 제어해 검증하며 PDF.js 객체 전체를 타입 단언으로 위조하지 않는다. (FR-002, FR-006, FR-018)
- [x] [T005] `src/features/reader/lib/reader-state.test.ts`에 한 페이지 높이 맞춤과 너비 초과 방지 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/hooks/use-reader-layout.ts`에 `ResizeObserver`로 가용 너비와 높이 측정 및 정리를, `src/features/reader/lib/reader-state.ts`에 페이지 전체가 두 값 안에 들어오는 최대 배율 계산을 구현한다. 실제 컴포넌트의 컨테이너 크기 변경은 T007에서 검증하고, 회전 후 `getViewport({ scale: 96 / 72 })` 크기를 100% 기준으로 사용한다. 수동 확대·두 페이지 계산은 이후 단계에서 추가한다. (FR-001, FR-015)
- [x] [T006] `src/features/reader/components/pdf-viewport.test.tsx`에 한 페이지 그리기·표시 크기 변경·작업 취소·늦은 완료와 오류·재시도 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/components/pdf-viewport.tsx`에서 요청마다 Canvas와 `RenderTask`를 관리하고 마지막 요청의 결과만 표시한다. 같은 Canvas에 동시에 그리지 않으며 CSS 크기와 DPR을 반영한 픽셀 크기를 구분한다. 이전 본문을 숨긴 로딩 상태, 보조 기술로 확인 가능한 안내, 페이지 표시 실패와 재시도를 제공한다. (FR-002, FR-018, FR-019)
- [x] [T007] `src/app.test.tsx`에 제목·파일명 대체 표시·첫 페이지·높이 맞춤·가로 중앙 배치·로딩과 오류 화면 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/components/reader.tsx`, `src/features/reader/components/reader-toolbar.tsx`, `src/app.tsx`를 연결해 `/`에서 Reader를 표시한다. 제목과 `1 / 전체 페이지 수`를 보여주고, 자동 맞춤과 로딩·오류에서 가로·세로 스크롤이나 잘못된 번호 안내를 만들지 않는다. `src/app.css`와 import를 제거하고 Tailwind로 고정 조작부와 필요할 때만 스크롤하는 본문을 구성한다. 320px 화면에서도 제목과 재시도 버튼이 레이아웃 밖으로 밀려나지 않아야 하며, 말줄임된 제목의 전체 이름을 heading의 접근 가능한 이름으로 유지해야 한다. (FR-001, FR-003, FR-004, FR-005, FR-015, FR-020)
- [x] [T008] `e2e/app.spec.ts`의 카운터 검증을 초기 Reader 진입·새로고침 검증으로 교체한다. `e2e/basic-pdf-reader.spec.ts`에서 실제 텍스트·스캔 PDF 첫 페이지의 높이 맞춤·가로 중앙 배치·스크롤 없음과 요청 실패 후 재시도를 확인한다. `page.route().fulfill({ path })`로 샘플을 바꾸고, 완료 상태와 고유 도형이 있는 텍스트·스캔 대표 본문 스냅샷을 직접 검토한다. 폰트·CMap·이미지 디코더 자원이 필요하면 `src/features/reader/lib/pdf-document.ts`에서 같은 패키지 버전의 필요한 자원만 자체 제공한다. `package.json`의 check·build·E2E 명령과 preview에서 PDF·worker 제공까지 검증한다. (SC-001의 첫 페이지 표시, SC-004의 로딩 복구, FR-021)

## 섹션 1 [P] 페이지 탐색

**담당 범위:** `page-navigation.*`, `page-navigator.*`, 한 장 PDF fixture, 탐색용 shadcn UI, 페이지 탐색 화면 연결. **완료 기준:** 다른 미완료 섹션 없이 집중 테스트가 통과하고, 현재 페이지·전체 페이지 수·비활성 상태·변경 콜백만으로 통합할 수 있으며 개발 서버에서 페이지 탐색을 조작할 수 있다.

- [ ] [T009] `package.json`, `pnpm-lock.yaml`에 `pnpm add lucide-react`로 아이콘을 추가한다. `src/components/ui/`에는 Field·Input·Slider·Separator·Tooltip과 의존 컴포넌트를 공식 CLI로 추가한다. Slider는 현재 Base UI API를 확인하고 `[currentPage]`로 thumb 하나를 표시하도록 구성한다. thumb 색상은 의미 토큰을 사용하고 기존 테마·variant·키보드 동작을 유지한다.
- [ ] [T010] `src/features/reader/lib/page-navigation.test.ts`에 한 페이지 보기의 앞뒤 이동·첫과 마지막 경계·번호 입력 검증 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/lib/page-navigation.ts`에 페이지 범위 계산과 입력 검증을 구현한다. 표지를 포함한 1부터의 번호를 사용하고 빈 값·문자·소수·지수 표기·범위 밖 값은 거부한다. (FR-005, FR-011, FR-012)
- [ ] [T011] `src/features/reader/components/page-navigator.test.tsx`에 이전·다음·번호 동기화·Enter 확정·잘못된 입력 후 위치 유지·오류 수정·한 장 문서 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/components/page-navigator.tsx`는 현재 페이지·전체 페이지 수·사용 가능 여부와 `onPageChange`만 props로 받고, Reader 상태를 직접 import하지 않는다. 첫·마지막과 로딩 중 이동을 비활성화하며 오류를 입력과 연결한다. (FR-003, FR-005, FR-011부터 FR-013, FR-019)
- [ ] [T012] `src/features/reader/components/page-navigator.test.tsx`에 슬라이더 선택·키보드 이동·입력창 동기화·한 장 문서 비활성화 테스트를 먼저 작성해 실패를 확인한다. Slider 반환값은 타입과 길이를 확인해 처리하고 320px 화면에서도 조작이 겹치지 않도록 배치한다. `e2e/fixtures/pdf/single-page.pdf`에 번호와 도형으로 식별할 수 있는 한 장 문서를 준비한다. (FR-013, FR-019, FR-020)
- [ ] [T013] `pnpm test -- src/features/reader/lib/page-navigation.test.ts src/features/reader/components/page-navigator.test.tsx`와 `pnpm typecheck`를 통과시킨다. 섹션 담당 파일과 테스트, shadcn CLI가 실제로 변경한 `package.json`, `pnpm-lock.yaml` 외에는 변경되지 않았는지 확인하고 공개 props와 한 장 fixture 경로를 정리한다.
- [ ] [T013A] `src/features/reader/components/reader-page-navigation.test.tsx`에 `PageNavigator`가 화면에 표시되고 페이지 변경이 본문과 현재 페이지 표시에 반영되는 최소 연결 테스트를 먼저 작성한다. `src/features/reader/components/reader.tsx` 하단에 페이지 탐색만 연결하고 페이지 이동 뒤 본문 스크롤을 맨 위로 옮긴다. 기능 구현 변경과 화면 연결 변경을 별도 커밋으로 남기고 `pnpm dev`에서 이전·다음·번호 입력·슬라이더를 직접 확인한 뒤 통합 담당자에게 인계한다. (FR-003, FR-005, FR-011부터 FR-013)

## 섹션 2 [P] 한 페이지·두 페이지 보기

**담당 범위:** `page-spread.*`, `view-mode-control.*`, `pdf-viewport.*`, 방향별 PDF fixture, 보기용 shadcn UI, 보기 전환 화면 연결. **완료 기준:** 방향·배치·앞뒤 범위와 최대 두 Canvas의 완료·실패 처리를 다른 미완료 섹션 없이 검증하고 개발 서버에서 한 페이지·두 페이지 보기를 전환할 수 있다.

- [x] [T014] `e2e/fixtures/pdf/`에 가로 3장·세로/세로/가로/세로/세로 5장·회전·정사각형 PDF를 준비하고 페이지별 크기·번호·도형을 확인한다. 세로 홀수 검증에는 기존 기본 샘플 5장을 재사용한다. `src/components/ui/`에 ToggleGroup과 의존 컴포넌트를 추가하고 현재 Base UI의 배열 값과 `multiple` API를 확인한다.
- [x] [T015] `src/features/reader/lib/page-spread.test.ts`에 방향·함께 표시할 페이지·이전과 다음·오른쪽 페이지 선택 유지·화면 폭과 읽기 영역 폭의 독립적인 경계 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/lib/page-spread.ts`에 세로 두 장, 가로와 홀로 남은 세로 단독, 표지 일반 처리와 두 페이지 허용 조건을 구현한다. 화면 폭 1024px 이상과 읽기 영역 1000px 이상을 모두 만족해야 두 페이지를 허용한다. (FR-006부터 FR-011, FR-016)
- [x] [T016] `src/features/reader/components/pdf-viewport.test.tsx`에 최대 두 페이지의 완료 대기·한쪽 실패·작업 취소·늦은 결과·보기 변경 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/components/pdf-viewport.tsx`는 새 `pages` prop으로 한 페이지 또는 두 페이지 목록과 공통 배율을 받아 Canvas를 최대 두 개만 만들고 표시 상태를 콜백으로 알린다. 전환 기간에는 기존 단일 `page` prop도 지원하되 `page`와 `pages` 중 하나만 전달하도록 props 타입을 정의하고, 단일 페이지는 내부에서 페이지 목록으로 정규화한다. 기존 `page` 호출도 테스트하며 T025에서 화면 연결 병합을 완료할 때까지 지원한다. 모든 페이지가 준비된 뒤 본문을 표시하며 가로 분할이나 마지막 페이지 옆의 가상 지면은 만들지 않는다. (FR-005, FR-007, FR-009, FR-018)
- [x] [T017] `src/features/reader/components/view-mode-control.test.tsx`에 보기 전환·빈 배열 선택 유지·제한 사유·키보드 조작 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/components/view-mode-control.tsx`는 보기 선호·적용 가능 여부와 변경 콜백만 받고, 제한 사유를 hover 없이 확인할 수 있게 한다. (FR-003, FR-010, FR-016, FR-019)
- [x] [T018] `pnpm test -- src/features/reader/lib/page-spread.test.ts src/features/reader/components/view-mode-control.test.tsx src/features/reader/components/pdf-viewport.test.tsx`와 `pnpm typecheck`를 통과시킨다. 섹션 담당 파일과 테스트, shadcn CLI가 실제로 변경한 `package.json`, `pnpm-lock.yaml` 외에는 변경되지 않았는지 확인하고 보기·표시 상태 처리 방식과 fixture 경로를 정리한다.
- [ ] [T018A] `src/features/reader/components/reader-view-mode.test.tsx`에 보기 조작이 화면에 표시되고 한 페이지 보기에서 두 페이지 보기로 전환할 때 Canvas 수가 1개에서 2개로 바뀌며 현재 페이지 표시도 갱신되는 최소 연결 테스트를 먼저 작성한다. `src/features/reader/components/reader-toolbar.tsx`와 `src/features/reader/components/reader.tsx`에 보기 전환만 연결한다. `Reader`는 `page-spread`가 계산한 표시 페이지 목록을 `PdfViewport`의 `pages` prop으로 전달하며, 기존 `page={firstPage}` 호출을 이 작업에서 교체한다. 기능 구현 변경과 화면 연결 변경을 별도 커밋으로 남기고 `pnpm dev`에서 한 페이지·두 페이지 보기와 제한 사유를 직접 확인한 뒤 통합 담당자에게 인계한다. (FR-003, FR-006부터 FR-010, FR-016)

## 섹션 3 [P] 크기 조절

**담당 범위:** `reader-zoom.*`, `zoom-controls.*`, 크기 조절 화면 연결. **완료 기준:** 한 장 또는 두 장의 크기와 가용 영역을 입력으로 받아 높이 맞춤과 수동 배율을 계산하고, 배율 상태·변경 콜백만으로 조작부를 통합할 수 있으며 개발 서버에서 배율을 조작할 수 있다.

- [x] [T019] `src/features/reader/lib/reader-zoom.test.ts`에 한 페이지·두 페이지 높이 맞춤, 간격 포함 너비, 너비 초과 방지, 수동 배율 25%부터 300%, 25%p 증감, 높이 맞춤 해제·복귀와 한도 밖에서 시작하는 조작 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/lib/reader-zoom.ts`에 현재 표시하는 모든 페이지가 가용 너비와 높이 안에 들어오는 같은 배율과 수동 배율 계산을 구현한다. 높이 맞춤에는 수동 한도를 적용하지 않고 상한 이상에서 확대·하한 이하에서 축소를 비활성화한다. (FR-014, FR-015)
- [x] [T020] `src/features/reader/components/zoom-controls.test.tsx`에 확대·축소·확대율·높이 맞춤·한계 비활성화·키보드 조작 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/components/zoom-controls.tsx`는 맞춤 여부·표시 배율·조작 가능 여부와 변경 콜백만 받고, 페이지·보기·패널 상태를 직접 import하지 않는다. 320px 화면에서도 조작부가 잘리거나 겹치지 않아야 한다. (FR-003, FR-014, FR-015, FR-019, FR-020)
- [x] [T021] `pnpm test -- src/features/reader/lib/reader-zoom.test.ts src/features/reader/components/zoom-controls.test.tsx`와 `pnpm typecheck`를 통과시킨다. 섹션 담당 파일과 테스트, shadcn CLI가 실제로 변경한 `package.json`, `pnpm-lock.yaml` 외에는 변경되지 않았는지 확인하고 배율 계산 방식과 조작 콜백을 정리한다.
- [x] [T021A] `src/features/reader/components/reader-zoom.test.tsx`에 크기 조절이 화면에 표시되고 확대·축소·높이 맞춤 결과가 본문 배율에 반영되는 최소 연결 테스트를 먼저 작성한다. `src/features/reader/components/pdf-viewport.test.tsx`에는 200ms 배율 전환과 동작 감소 설정 테스트를 추가한다. `src/features/reader/components/reader-toolbar.tsx`, `src/features/reader/components/reader.tsx`, `src/features/reader/components/pdf-viewport.tsx`에 한 페이지 기준 크기 조절과 Canvas 표시 영역 전환만 연결하며 보기 전환을 임시 구현하지 않는다. 기능 구현 변경과 화면 연결 변경을 별도 커밋으로 남기고 `pnpm dev`에서 확대·축소·확대율·높이 맞춤을 직접 확인한 뒤 통합 담당자에게 인계한다. (FR-003, FR-014, FR-015)

## 섹션 4 [P] 보조 패널과 반응형 동작

**담당 범위:** `reader-panel.*`, `use-reader-layout.*`, 패널용 shadcn UI, 패널 화면 연결. **완료 기준:** 패널 열림 여부·화면 경계·읽기 영역 측정값과 변경 콜백만으로 통합할 수 있고, 넓은 화면과 좁은 화면의 패널 동작 및 포커스 복원을 독립 검증하며 개발 서버에서도 패널을 조작할 수 있다.

- [x] [T022] `src/components/ui/`에 Collapsible·Sheet와 의존 컴포넌트를 추가한다. `src/index.css`의 기존 토큰을 사용하고 현재 Base UI의 포커스 API와 생성 코드의 키보드 동작을 확인한다. 다른 UI를 재설치하거나 프리셋을 변경하지 않는다.
- [x] [T023] `src/features/reader/hooks/use-reader-layout.test.ts`에 `ResizeObserver`와 `matchMedia`의 최초 측정·변경·정리, 화면 폭 1023/1024px와 읽기 영역 999/1000px 경계를 먼저 작성해 실패를 확인한다. `src/features/reader/hooks/use-reader-layout.ts`가 화면 폭과 읽기 영역의 가용 너비·높이를 구분해 제공하도록 구현한다. (FR-015부터 FR-017)
- [x] [T024] `src/features/reader/components/reader-panel.test.tsx`에 패널 열기·닫기·화면 경계 전환·Escape·포커스 복원 테스트를 먼저 작성해 실패를 확인한다. `src/features/reader/components/reader-panel.tsx`는 화면 폭·열림 여부·변경 콜백·열기 버튼 ref만 받는다. 화면 폭 1024px 이상은 본문 옆 320px 영역, 미만은 본문 위 Sheet를 사용하고 제목과 닫기 조작만 제공한다. `pnpm test -- src/features/reader/hooks/use-reader-layout.test.ts src/features/reader/components/reader-panel.test.tsx`와 `pnpm typecheck`를 통과시킨 뒤 레이아웃과 포커스 처리 방식을 정리한다. (FR-017, FR-019)
- [x] [T024A] `src/features/reader/components/reader-panel-integration.test.tsx`에 패널 조작이 화면에 표시되고 열기·닫기·포커스 복원과 읽기 영역 변화가 반영되는 최소 연결 테스트를 먼저 작성한다. `src/features/reader/components/reader-toolbar.tsx`와 `src/features/reader/components/reader.tsx`에 패널과 레이아웃 측정만 연결한다. 기능 구현 변경과 화면 연결 변경을 별도 커밋으로 남기고 `pnpm dev`에서 넓은 화면의 옆 패널과 좁은 화면의 Sheet를 직접 확인한 뒤 통합 담당자에게 인계한다. (FR-003, FR-015부터 FR-017, FR-019)

## 통합과 전체 독서 흐름 검증

**선행 단계:** 섹션 1~4의 기능 구현과 화면 연결 변경을 순서대로 병합. **담당 범위:** 병렬 진행 규칙에서 제외한 앱 조합 파일과 전체 E2E, 공용 조합 파일의 충돌 해결. **완료 기준:** 병렬 섹션의 공개 props와 화면 연결을 하나의 Reader로 정리해 SC-001부터 SC-006까지 만족한다. 이 단계에는 병렬 섹션의 남은 기능 구현을 미루지 않고 연결 조정, 통합 회귀 테스트와 검증에서 발견한 결함 수정만 포함한다.

- [ ] [T025] 페이지 탐색 → 보기 전환 → 크기 조절 → 보조 패널 순서로 화면 연결 변경을 병합하고 `src/features/reader/components/reader.tsx`, `src/features/reader/components/reader-toolbar.tsx`의 충돌을 섹션별 공개 props와 순수 함수 사용 방식에 맞춰 해결한다. 화면 연결 병합 후 `PdfViewport`의 임시 `page` prop과 이를 검증하는 테스트를 제거하고 모든 호출을 `pages` prop으로 통일한다. `src/features/reader/components/reader.test.tsx`에는 탐색·보기 선호·배율·패널 상태를 함께 사용하는 흐름을 먼저 작성하고, `src/app.tsx`까지 최종 연결한다. 현재 페이지를 유지하고 이전·다음 이동 뒤 본문 상단을 표시하며, 페이지·보기·창·패널 변경에 맞춰 표시 범위와 높이 맞춤을 갱신한다. 수동 배율은 유지하고 확대된 본문의 모든 가장자리까지 스크롤할 수 있게 한다. 섹션별 Reader 연결 테스트와 같은 세부 동작은 반복하지 않는다. (FR-001, FR-003, FR-005, FR-010부터 FR-017, FR-020)
- [ ] [T026] `src/app.test.tsx`, `src/features/reader/components/reader.test.tsx`, `e2e/app.spec.ts`, `e2e/basic-pdf-reader.spec.ts`에서 텍스트·스캔·한 장·세로 홀수·가로·혼합·회전·정사각형 PDF의 탐색·보기·확대·패널과 새로고침 초기화를 검증한다. 빠른 이동과 배율 변경, 페이지 실패·재시도·늦은 결과, 입력 오류 복구, 화면 1023/1024px와 읽기 영역 999/1000px, 320px 키보드 흐름을 확인한다. 대표 두 페이지 스냅샷을 직접 검토한다. 목차·검색·북마크·설정·AI 도구와 영구 저장은 추가하지 않는다. (SC-001부터 SC-004, SC-006)
- [ ] [T027] `e2e/basic-pdf-reader.spec.ts`의 키보드 흐름을 기준으로 브라우저 메뉴에서 실제 200% 확대 후 전체 조작부·긴 제목·높이 맞춤의 스크롤 없음·수동 확대 본문의 스크롤·패널 포커스를 직접 확인한다. viewport 축소나 DPR 변경으로 대체하지 않는다. 수정이 필요하면 재현 가능한 회귀 테스트를 먼저 추가하고 다시 확인한다. (SC-005)
- [ ] [T028] `package.json`의 `pnpm check`, `pnpm build`, `pnpm test:e2e`를 실행하고 `pnpm preview`에서 PDF·worker·필요 자원과 실제 독서 흐름을 확인한다. `specs/basic-pdf-reader/spec.md`의 SC-001부터 SC-006까지 아래 대응표로 점검하고, `specs/basic-pdf-reader/tasks.md`에는 실제 완료한 항목만 체크한다. 실행 결과와 미실행 검증이 있다면 그 이유를 보고한다.

## 완료 기준과 검증 작업

| 완료 기준                                | 확인할 작업                                 |
| ---------------------------------------- | ------------------------------------------- |
| SC-001: 텍스트·스캔 PDF 읽기와 크기 조절 | T008, T019부터 T021, T025, T026             |
| SC-002: 방향별 배치와 페이지 이동        | T014부터 T018, T025, T026                   |
| SC-003: 화면·읽기 영역 폭 경계           | T015, T023부터 T026                         |
| SC-004: 잘못된 입력·실패·늦은 응답       | T004, T006, T008, T010부터 T012, T016, T026 |
| SC-005: 키보드·좁은 화면·브라우저 확대   | 각 UI 구현·화면 연결 작업, T025부터 T027    |
| SC-006: 제외 기능 없이 독서 완료         | T026                                        |

최종 검증은 T028에서 확인한다.
