# 구현 계획: Ebook 책장

**브랜치**: `main` | **작성일**: 2026-09-16 | **명세**: [spec.md](./spec.md)

## 요약

현재 React 19·TypeScript·Vite 애플리케이션에 로그인 없는 로컬 Ebook 책장을 추가한다. 사용자가
선택한 PDF는 브라우저 전용 Worker에서 실행되는 SQLite WASM의 `opfs` VFS에 원본 BLOB, 첫 페이지
표지, 서지 정보, 전체 페이지 수, 마지막 읽은 페이지와 함께 저장한다. 책장에서는 저장 공간 현황,
다중 파일 업로드 결과, 책별 진행률, 삭제와 수동 새로고침을 제공하고, 저장된 원본을 기존 Reader로
전달해 마지막 페이지부터 읽을 수 있게 한다.

SQLite와 PDF 해석은 메인 스레드 밖에서 수행한다. 하나의 `books` 테이블과 짧은 트랜잭션을 사용해
업로드와 삭제를 원자적으로 처리하고, 여러 탭은 각각 DB 연결을 열되 자동 동기화 계층은 두지
않는다. 충돌은 제한된 재시도와 작업 직전 존재 여부 확인으로 처리하며 사용자가 책장의 새로고침
버튼으로 최신 상태를 가져온다.

## 기술 컨텍스트

**언어/버전**: TypeScript 5.9, React 19.2, Node.js 24.x  
**빌드 도구**: Vite 8, pnpm 12.4.1  
**주요 의존성**: React Router 8, PDF.js 6, `@sqlite.org/sqlite-wasm`, shadcn/Base UI,
Tailwind CSS 4, Lucide React  
**저장소**: SQLite WASM `opfs` VFS의 단일 DB 파일. 서버 저장소와 계정은 사용하지 않음  
**테스트**: Vitest, jsdom, React Testing Library, user-event, Playwright Chromium  
**대상 플랫폼**: HTTPS 또는 localhost의 최신 브라우저 중 WebAssembly, Dedicated Worker,
OPFS 동기 접근 핸들, StorageManager API를 지원하는 환경  
**프로젝트 유형**: 클라이언트 전용 단일 페이지 웹 애플리케이션  
**성능 목표**: DB와 PDF 파싱으로 메인 스레드를 장시간 점유하지 않고, 정밀 포인터의 표지 회전은
합성 가능한 transform만 갱신하며, 목록에서는 원본 PDF BLOB을 읽지 않음  
**제약**: 로그인·서버 동기화·백업 내보내기 없음, 영구 저장 허용 전 업로드 금지, 파일별 고정 크기
제한 없음, 여러 탭 허용, 320px와 200% 확대 지원  
**범위**: 책장 목록과 Reader 진입 2개 경로, PDF 업로드·복원·삭제·진행률·용량 관리

## 선행 조건

- `specs/basic-pdf-reader/tasks.md`의 페이지 이동과 초기 페이지 지정 기능이 먼저 완료되어야 한다.
  현재 Reader는 첫 페이지만 표시하므로 이 기능에서 별도 페이지 탐색기를 중복 구현하지 않는다.
- 선행 작업 완료 후 Reader의 공개 입력을 URL 전용에서 `URL | Uint8Array` 문서 원본,
  `initialPage`, `onPageChange`로 확장한다. Ebook 페이지는 Reader의 내부 훅이나 컴포넌트를 직접
  가져오지 않고 공개 `Reader` 컴포넌트만 조합한다.
- 현재 브랜치는 바꾸지 않는다. 구현 작업은 저장소 원칙에 따라 한 번에 하나씩 진행하고,
  `tasks.md`가 생성된 뒤 해당 항목 단위로 TDD를 수행한다.

## 헌법 준수 점검

### 명세 우선

- `spec.md`의 FR-001부터 FR-039와 SC-001부터 SC-012를 구현 범위로 삼는다.
- 서버 동기화, 사용자 계정, 백업 내보내기·가져오기, 자동 탭 동기화는 제외한다.
- 구현 중 범위나 저장 정책을 바꿔야 하면 코드보다 명세와 계획을 먼저 갱신한다.

### 테스트 우선

- 각 작업은 관찰 가능한 실패 테스트를 먼저 추가하고, 실패 이유를 확인한 뒤 최소 구현으로
  통과시킨다.
- 계산과 변환 규칙은 단위 테스트, 화면 상태와 사용자 조작은 컴포넌트 테스트, 실제 OPFS와 다중
  탭·재시작 흐름은 Playwright E2E로 나눈다. 같은 조건을 여러 층에서 반복하지 않는다.
- 실제 브라우저 API를 jsdom에서 흉내 내어 SQLite 자체를 검증하지 않는다. 컴포넌트 테스트에는
  좁은 저장소 포트를 주입하고, SQLite·Worker·OPFS 통합은 Chromium에서 검증한다.

### 단순한 구조

- PDF 원본과 파생 데이터를 별도 파일·DB로 나누지 않고 단일 SQLite 테이블에 둔다. 이 구조가 한
  권의 삽입과 삭제를 하나의 트랜잭션으로 끝내는 가장 작은 설계다.
- Repository 계층, 이벤트 버스, BroadcastChannel, Comlink, 상태 관리 라이브러리를 추가하지
  않는다. 화면용 훅 하나와 작은 Worker 클라이언트로 비동기 상태를 관리한다.
- 브라우저 기본 `crypto.subtle`, `StorageManager`, `Worker`를 사용하고 같은 목적의 의존성을
  추가하지 않는다.

### UI와 접근성

- `DESIGN.md`, shadcn 스킬과 현재 Base UI API를 따른다. 테마 값은 `src/index.css` 토큰에서
  정의하고, 서비스 컴포넌트의 `className`은 주로 레이아웃에 사용한다.
- shadcn CLI `--dry-run`에서 확인한 `alert-dialog`, `card`, `empty`, `progress`만 실제 사용 시
  추가한다. 기존 `button`, `alert`, `skeleton`은 재사용한다.
- 키보드, 포커스, 상태 텍스트, 동작 감소, 터치 환경과 200% 확대를 기능 완료 조건에 포함한다.

**게이트 결과**: 위반 사항 없음. 상세 설계 후에도 별도 서버, 추가 상태 라이브러리나 저장 계층을
도입하지 않으므로 재점검 결과는 동일하다.

## 아키텍처

```text
App routes
├── /                         EbookListPage
│   └── EbookLibrary          목록·업로드·삭제·용량·새로고침
└── /books/:bookId            EbookReaderPage
    └── Reader                저장된 바이트·초기 페이지·진행률 콜백

Main thread
├── useEbookLibrary           화면 상태와 파일별 작업 상태
├── ebookStoreClient          요청 ID 기반 Worker 메시지와 오류 매핑
├── StorageManager            persist/persisted/estimate
└── PDF import orchestration  검증·메타데이터·해시·표지 렌더링

PDF.js worker                 기존 PDF.js worker로 문서 분석

Dedicated SQLite worker
└── @sqlite.org/sqlite-wasm
    └── sqlite3.oo1.OpfsDb
        └── /ebook-library.sqlite3
```

### SQLite 실행 모델

- `@sqlite.org/sqlite-wasm`의 공식 ESM 모듈을 Dedicated Worker에서 초기화한다.
- 여러 탭을 지원하지 않는 `opfs-sahpool` 대신 기본 `opfs` VFS를 사용한다. 폐기 예정인
  Worker1/Promiser API를 사용하지 않고, 앱에 필요한 명령만 가진 작은 타입 메시지 프로토콜을
  작성한다.
- 각 탭의 Worker는 같은 DB에 연결한다. SQL 문은 명령 안에서 준비하고 즉시 종료하며 트랜잭션은
  BLOB 삽입·삭제·진행률 갱신에 필요한 짧은 범위로 제한한다.
- `SQLITE_BUSY`와 잠금 오류는 짧은 backoff로 제한된 횟수만 재시도한다. 모두 실패하면 성공한
  것처럼 UI를 바꾸지 않고 다른 탭 사용 가능성을 포함한 오류를 반환한다.
- `PRAGMA user_version`으로 최초 스키마 버전을 기록한다. 이번 기능에서는 마이그레이션 프레임워크
  대신 `0 → 1` 초기화만 구현하고, 다음 스키마 변경 때 명시적 버전 분기를 추가한다.

### Worker 명령

메인 스레드와 SQLite Worker 사이에는 다음 명령만 노출한다.

| 명령             | 입력                      | 반환/보장                                   |
| ---------------- | ------------------------- | ------------------------------------------- |
| `initialize`     | 없음                      | DB 열기와 스키마 초기화 결과                |
| `listBooks`      | 없음                      | PDF 원본을 제외한 책장 요약 목록            |
| `getBook`        | 책 ID                     | 최신 존재 여부와 Reader용 PDF 바이트·진행률 |
| `addBook`        | 원본·표지·메타데이터·해시 | 중복 확인 후 한 트랜잭션으로 한 권 삽입     |
| `deleteBook`     | 책 ID                     | 존재 여부 재확인 후 관련 행 전체 삭제       |
| `updateProgress` | 책 ID·페이지              | 범위와 존재 여부를 확인한 조건부 갱신       |
| `updateCover`    | 책 ID·표지                | 재생성 성공 시 표지만 갱신                  |

각 요청은 `requestId`를 가지며 응답은 성공 값 또는 식별 가능한 오류 코드 중 하나다. 컴포넌트가
SQLite 오류 문자열에 의존하지 않도록 `unsupported`, `persistence-denied`, `quota`, `duplicate`,
`deleted`, `locked`, `storage-failed`로 매핑한다.

## 데이터 모델

초기 스키마는 관계가 1:1인 정보를 한 행에 보관한다.

```sql
CREATE TABLE books (
  id TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  publisher TEXT,
  page_count INTEGER NOT NULL CHECK (page_count > 0),
  pdf_data BLOB NOT NULL,
  cover_data BLOB,
  cover_mime TEXT,
  cover_status TEXT NOT NULL CHECK (cover_status IN ('ready', 'fallback')),
  last_page INTEGER CHECK (
    last_page IS NULL OR (last_page >= 1 AND last_page <= page_count)
  ),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX books_created_at_idx ON books(created_at DESC, id DESC);
```

- `id`는 `crypto.randomUUID()`로 만든다.
- `content_hash`는 원본 바이트의 SHA-256이다. 파일명과 관계없이 동일 내용을 막는다.
- 목록 쿼리는 `pdf_data`를 선택하지 않는다. Reader 진입 시 선택한 한 권의 원본만 가져온다.
- `last_page`가 `NULL`이면 읽지 않은 책이다. 범위를 벗어난 기존 값은 Reader를 열 때 1로 복구하고
  DB도 정정한다.
- 기본 정렬은 최근 업로드 순이며 `id`를 보조 정렬 키로 사용한다. 정렬 UI는 이번 범위가 아니다.
- 책 삭제는 행 하나를 지우므로 원본·표지·메타데이터·진행률이 같은 트랜잭션에서 제거된다.

## PDF 가져오기 흐름

1. 책장 초기화 시 OPFS와 Worker 지원 여부, DB 열기 결과, 영구 저장 상태와 용량 추정치를 읽는다.
2. 첫 업로드 버튼의 사용자 제스처 안에서 `navigator.storage.persisted()`를 확인하고, 필요하면
   `navigator.storage.persist()`를 호출한다. 거부되면 파일을 쓰지 않고 이후 업로드를
   비활성화한다.
3. 사용자가 선택한 파일은 메모리 사용량과 DB 잠금 시간을 제한하기 위해 한 번에 하나씩 순차
   처리한다. 한 파일 실패는 다음 파일 처리를 중단하지 않는다.
4. 각 파일 직전에 최신 `estimate()`를 조회한다. `file.size > quota - usage`이면 저장을 시도하지
   않는다. 통과해도 DB 오버헤드 때문에 실패할 수 있으므로 실제 삽입 오류를 별도로 처리한다.
5. PDF.js로 문서를 열어 유효성, 암호 필요 여부와 페이지 수를 확인한다. MIME이나 확장자만으로
   유효한 PDF라고 판단하지 않는다.
6. 제목은 유효한 PDF 메타데이터를 우선하고 없으면 확장자를 뺀 파일명을 쓴다. 지은이와 출판사는
   비어 있지 않은 메타데이터만 저장하며, `Producer`는 PDF 생성 프로그램이므로 출판사로 쓰지
   않는다.
7. 첫 페이지의 회전과 원본 비율을 적용해 최대 너비 480px의 WebP 표지를 만든다. WebP 인코딩을
   사용할 수 없으면 PNG로 저장한다. 렌더링이 실패하면 원본은 기본 표지 상태로 저장하고 재생성
   동작을 제공한다.
8. 해시, 원본, 파생 데이터와 메타데이터를 `addBook` 한 번으로 전달한다. Worker는 중복 확인과
   삽입을 단일 트랜잭션에서 수행한다. 큰 원본 바이트는 `postMessage`의 transferable로 넘겨
   불필요한 복사를 줄인다.
9. 파일별 상태를 성공·중복·유효하지 않음·암호 필요·용량 부족·저장 실패로 표시한다. 각 완료나
   실패 후 목록과 용량 추정치를 다시 읽는다.
10. PDF.js 문서와 렌더 작업, Worker로 넘긴 임시 바이트 참조를 정리해 다음 파일 처리 전에 큰
    메모리가 유지되지 않게 한다.

PDF 해석은 프로젝트에 이미 설정된 PDF.js worker가 담당한다. 별도의 앱 전용 PDF Worker를 한 겹
더 만들지 않고, 메인 스레드는 메타데이터 선택과 canvas 결과 인코딩만 조정한다. SQLite Worker는
DB 연결만 소유하며, 가져오기 로직은 파일별 작업이 끝나면 PDF.js 문서와 렌더 자원을 즉시
폐기한다.

## 저장 공간과 영구 저장

- 화면에는 `navigator.storage.estimate()`의 `usage`, `quota`, `max(0, quota - usage)`를 사람이
  읽기 쉬운 단위로 표시하고 모두 브라우저 추정치임을 알린다.
- 용량 조회 실패는 책 열기·삭제를 막지 않는다. 마지막 수치를 최신값처럼 유지하지 않고
  `확인할 수 없음` 상태와 재시도를 제공한다.
- DB 초기화 또는 필수 API 지원 실패는 저장 기능 전체의 오류로 표시한다. 이미 목록을 읽을 수
  있는 경우에는 가능한 열람과 삭제를 유지한다.
- 영구 저장이 이미 허용된 경우 다시 요청하지 않는다. 거부를 일반 저장으로 우회하거나 앱에서
  브라우저 권한을 반복 요청하지 않는다.
- 개발·미리보기·Vercel 응답에 `Cross-Origin-Opener-Policy: same-origin`과
  `Cross-Origin-Embedder-Policy: require-corp`를 설정한다. Vite 의존성 사전 번들에서는
  `@sqlite.org/sqlite-wasm`을 제외한다. 배포 후 `crossOriginIsolated`와 SQLite Worker 시작을 함께
  검증한다.

## 다중 탭과 진행률

- 목록은 자동으로 다른 탭의 변경을 반영하지 않는다. 사용자의 새로고침 동작이 `listBooks`와
  용량을 다시 읽어 성공 시 현재 화면을 교체하고, 실패하면 기존 목록을 유지한다.
- 열기와 삭제 직전에 `getBook` 또는 조건부 삭제로 존재 여부를 확인한다. 이미 지워진 책이면
  오래된 카드 상태를 즉시 삭제 성공으로 간주하지 않고 `삭제된 PDF`라고 알린다.
- Reader는 페이지가 바뀔 때 마지막 값을 짧게 합쳐 저장하되, 유효 페이지마다 저장 예약을
  갱신한다. 탭 종료 시점만 믿지 않으며 `visibilitychange`에서는 대기 중인 값을 최선의 방식으로
  flush한다.
- 같은 책의 서로 다른 페이지는 별도 병합 규칙 없이 마지막으로 성공한 UPDATE가 최종 값이 된다.
  `updated_at`은 완료 시점 기록용이며 충돌 우선순위를 별도로 바꾸지 않는다.
- 진행률 UPDATE가 0행이면 다른 탭에서 삭제된 것으로 처리한다. Reader에 이미 전달된 바이트는
  현재 화면에서 계속 읽게 하되 삭제 상태를 표시하고, 그 뒤에는 저장 명령을 보내지 않는다. 화면을
  벗어나면 메모리의 원본 참조를 정리한다.

## UI 설계

### 페이지 구성

- `EbookListPage`: 페이지 제목, 로컬 저장 안내, 업로드 버튼, 저장 공간 요약, 수동 새로고침,
  파일별 결과와 책장 그리드를 배치한다.
- 빈 목록은 shadcn `Empty`, 초기 로딩은 `Skeleton`, 오류와 영구 저장 안내는 `Alert`를 사용한다.
- 책은 `Card`를 조합하고 표지, 제목, 지은이, 출판사, `읽지 않음 · 전체 페이지` 또는
  `현재 / 전체 페이지`, 열기와 삭제를 한 항목에 묶는다. 긴 값은 시각적으로 줄이되 `title`이나
  접근 가능한 설명으로 전체 값을 확인할 수 있게 한다.
- 삭제는 `AlertDialog`에서 책 제목, PDF·표지·진행률 삭제와 복구 불가를 알린다. 취소하거나 완료한
  뒤 적절한 포커스를 복원하고 실패하면 카드를 유지한다.
- 사용량은 텍스트와 `Progress`를 함께 쓰되 색만으로 상태를 전달하지 않는다.

### 책장과 3D 표지

- 반응형 CSS Grid로 최소 카드 폭을 유지하고 320px에서는 한 열로 줄인다. 선반 느낌은 토큰화된
  배경·테두리·그림자와 행 간격으로 표현하며 실제 책 정보의 가독성을 우선한다.
- 정밀 포인터에서만 표지 요소의 `pointermove`를 받아 요소 중심 대비 위치를 계산하고, React state
  대신 DOM ref의 CSS 변수 `--book-rotate-x`, `--book-rotate-y`만 갱신한다.
- 회전은 양 축 최대 6도로 제한하고 `pointerleave`에서 0도로 복구한다. 인접 카드 위로 넘어가지
  않도록 표지 컨테이너가 효과 범위를 자른다.
- `@media (hover: hover) and (pointer: fine)`에서만 효과를 켠다.
  `prefers-reduced-motion: reduce`는 회전과 복귀 전환을 모두 끄며, 터치·키보드에서는 정적인
  표지로 동일한 동작을 제공한다.
- 필요한 색상·그림자 값은 `src/index.css`의 라이트·다크 토큰과 `@theme inline`을 함께 갱신한다.
  카드 사용처에서 색상과 타이포그래피를 임의 유틸리티로 덮어쓰지 않는다.

## 파일 구조

```text
specs/ebook-list/
├── spec.md
├── plan.md
└── tasks.md

src/
├── app.tsx
├── index.css
├── pages/
│   ├── ebook-list-page.tsx
│   └── ebook-reader-page.tsx
├── components/ui/
│   ├── alert-dialog.tsx
│   ├── card.tsx
│   ├── empty.tsx
│   └── progress.tsx
├── features/
│   ├── ebook-list/
│   │   ├── components/
│   │   │   ├── ebook-library.tsx
│   │   │   ├── ebook-shelf.tsx
│   │   │   ├── book-card.tsx
│   │   │   ├── pdf-upload.tsx
│   │   │   ├── storage-summary.tsx
│   │   │   └── delete-book-dialog.tsx
│   │   ├── hooks/use-ebook-library.ts
│   │   ├── lib/
│   │   │   ├── ebook-store-client.ts
│   │   │   ├── ebook-db.worker.ts
│   │   │   ├── pdf-import.ts
│   │   │   ├── storage-manager.ts
│   │   │   └── format-bytes.ts
│   │   └── ebook-types.ts
│   └── reader/
│       ├── components/reader.tsx
│       └── hooks/use-pdf-document.ts
└── lib/pdf/pdf-document.ts

e2e/
├── ebook-list.spec.ts
├── ebook-reader-progress.spec.ts
└── ebook-multitab.spec.ts

vite.config.ts
vercel.json
package.json
```

단위·컴포넌트 테스트는 대상 파일 옆에 `*.test.ts(x)`로 둔다. `src/lib/pdf/pdf-document.ts`는 기존
Reader의 PDF 문서 로딩 로직을 공통으로 옮긴 결과이며, 공통 모듈이 Ebook 기능을 import하지 않게
한다. 서비스 UI는 `src/features/ebook-list`에 두고 공통 shadcn 컴포넌트를 수정해 기능 로직을
넣지 않는다.

## 구현 순서

1. **브라우저 기반 준비**
   - SQLite WASM 의존성, Vite·Vercel 헤더와 사전 번들 제외를 설정한다.
   - 개발 서버와 프로덕션 빌드에서 OPFS DB를 열 수 있는지 확인한다.
   - shadcn 컴포넌트는 `--dry-run`, `--diff`를 검토한 뒤 필요한 네 개만 추가한다.
2. **저장소 코어**
   - Worker 메시지 타입, 스키마 초기화, 목록·조회·삽입·삭제·진행률 SQL과 오류 매핑을 테스트
     우선으로 구현한다.
   - 실제 브라우저에서 reload 복원, 원자적 실패, 중복 해시와 두 탭 연결을 검증한다.
3. **PDF 가져오기**
   - 공통 PDF 문서 유틸리티를 정리하고 PDF.js worker를 이용한 검증, 메타데이터 fallback, 표지
     생성과 자원 해제를 구현한다.
   - 파일별 순차 파이프라인, 영구 저장 요청, 최신 용량 선검사와 결과 상태를 연결한다.
4. **책장 화면**
   - 초기화·빈 상태·업로드·오류·용량·새로고침 상태를 `useEbookLibrary`에서 관리한다.
   - Card 기반 책장, 진행률, 기본 표지와 재생성, 삭제 확인과 3D 상호작용을 구현한다.
5. **Reader 연결**
   - 선행 Reader 작업 완료 후 저장 바이트, 초기 페이지와 페이지 변경 콜백을 공개 API로 연결한다.
   - 삭제 감지, 진행률 저장 실패, 메모리에서 계속 읽기와 화면 이탈 정리를 구현한다.
6. **다중 탭·접근성·반응형 검증**
   - 두 페이지를 같은 Playwright context에서 열어 마지막 커밋, 오래된 목록, 삭제 중 Reader와
     수동 새로고침을 검증한다.
   - 키보드, 포커스 복원, reduced motion, 320px, 200% 확대와 대표 책장의 시각 결과를 확인한다.

## 테스트 전략

### 단위 테스트

- 바이트 단위 포맷과 잔여 용량 계산
- 메타데이터 공백 제거, 제목 fallback과 `Producer` 제외
- 페이지 범위 정규화와 진행률 표시 문구
- Worker 응답과 도메인 오류 매핑, 잠금 재시도 종료 조건
- 포인터 위치를 제한된 회전 각도로 변환하는 순수 계산

### 컴포넌트 테스트

- 로딩, 빈 목록, 지원 불가, 영구 저장 거부, 용량 확인 실패와 재시도
- 여러 파일의 독립된 처리 결과와 업로드 중 조작 상태
- 저장된 책의 메타데이터·진행률·긴 텍스트 접근
- 수동 새로고침 성공 시 교체와 실패 시 기존 목록 유지
- 삭제 확인·취소·실패·성공과 포커스 복원
- 표지 포인터 반응, leave 복귀와 reduced-motion 정적 동작

### E2E 테스트

- 유효한 PDF 업로드 후 첫 페이지 표지와 메타데이터 표시, reload 뒤 원본 열기
- 메타데이터 없는 파일, 손상·암호 PDF, 중복 내용과 표지 실패 fallback
- Reader의 마지막 페이지 저장과 재진입 복원
- 한 권 삭제 후 새로고침과 재접속에서도 다른 책만 유지
- 영구 저장 거부와 저장 공간 부족을 브라우저 API 경계에서 통제해 업로드 차단 확인
- 같은 context의 두 탭에서 마지막 성공 커밋, 수동 새로고침, 오래된 카드 열기·삭제, 열려 있는
  Reader의 삭제 감지 확인
- 320px viewport, 200% 확대, 키보드 전용 흐름과 reduced motion

E2E fixture는 작고 목적이 분명한 PDF로 유지한다. reload와 두 탭은 같은 context에서 검증하고,
브라우저 재시작 복원은 임시 user data 디렉터리를 쓰는 persistent context를 닫았다가 같은
디렉터리로 다시 열어 확인한다. 테스트가 끝나면 임시 profile만 정리한다. 시각 스냅샷은 사람이
확인한 대표 책장 상태만 남긴다.

## 검증 명령

```bash
pnpm test
pnpm check
pnpm build
pnpm test:e2e
```

SQLite WASM은 개발 서버와 Vercel 응답 헤더가 다르면 동작이 달라질 수 있으므로 `pnpm dev`의
E2E뿐 아니라 `pnpm build` 후 `pnpm preview`에서도 Worker 초기화, `crossOriginIsolated`, 업로드와
reload를 수동 확인한다. 모든 검사가 통과한 뒤 `git status`로 생성·변경 파일을 확인하고 해당
`tasks.md` 항목만 완료 처리한다.

## 위험과 대응

| 위험                                      | 대응                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| 브라우저가 영구 저장을 거부함             | 일반 저장으로 우회하지 않고 업로드를 비활성화하며 이유와 데이터 범위를 안내       |
| `estimate()` 값과 실제 기록 가능량이 다름 | 파일 크기 선검사는 빠른 거절 용도로만 쓰고 실제 삽입 실패도 원자적으로 처리       |
| 큰 PDF 처리 중 메모리가 증가함            | 파일을 순차 처리하고 표지 크기를 제한하며 문서·canvas·임시 바이트를 파일마다 정리 |
| 여러 탭의 DB 잠금 경쟁                    | 기본 `opfs` VFS, 짧은 트랜잭션, statement 즉시 종료, 제한된 backoff와 명시적 실패 |
| 다른 탭에서 삭제한 책이 다시 생성됨       | 진행률은 UPDATE만 허용하고 0행을 삭제로 처리하며 upsert를 사용하지 않음           |
| COEP가 외부 자원을 차단함                 | 배포 환경에서 폰트와 정적 자원을 확인하고 실제 차단이 확인된 자원만 자체 호스팅   |
| Reader 선행 기능이 미완성임               | Reader 탐색을 중복 개발하지 않고 basic-reader 완료 후 공개 API만 확장             |

## 복잡성 추적

헌법 위반은 없다. 앱이 직접 추가하는 Worker는 SQLite 연결을 소유하는 하나뿐이며 PDF.js의 기존
worker 설정을 재사용한다. 구현 중 이보다 복잡한 구조가 필요해지면 먼저 이 계획에 구체적인
필요성과 더 단순한 대안을 사용할 수 없는 이유를 기록한다.

## 기술 참고

- [SQLite WASM npm 패키지](https://sqlite.org/wasm/doc/trunk/npm.md)
- [SQLite WASM 영속 저장소](https://sqlite.org/wasm/doc/tip/persistence.md)
- [MDN Storage API와 할당량](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [MDN StorageManager.getDirectory](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/getDirectory)
- [React Router 선언적 라우팅](https://reactrouter.com/start/declarative/routing)
- [PDF.js PDFDocumentProxy API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentProxy.html)
- [Vercel 프로젝트 설정](https://vercel.com/docs/project-configuration/vercel-json)
