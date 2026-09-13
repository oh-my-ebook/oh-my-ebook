# oh-my-ebook 레포지토리 가이드라인

## 프로젝트 구조 및 모듈 구성

이 저장소는 TypeScript와 Vite를 사용하는 React 19 애플리케이션이다. `src/main.tsx`에서 `src/App.tsx`를 마운트하며, 스타일은 `src/index.css`와 `src/App.css`에 둔다. 가져와서 사용하는 이미지는 `src/assets/`에, 직접 제공하는 정적 파일은 `public/`에 둔다. 테스트는 `src/App.test.tsx`처럼 소스 파일과 같은 위치에 두며, 공통 테스트 설정은 `src/test/setup.ts`에 둔다. 빌드 결과물은 `dist/`에, 커버리지 보고서는 `coverage/`에 생성된다. Spec Kit 템플릿과 스크립트는 `.specify/`에 둔다.

## 빌드, 테스트 및 개발 명령어

Node 24.x(`.node-version`과 `.nvmrc`에 고정)와 pnpm 12.4.1을 사용한다.

- `pnpm install --frozen-lockfile`: 잠금 파일에 고정된 의존성을 설치하고 Lefthook 훅을 준비한다.
- `pnpm dev`: Vite 개발 서버를 시작한다.
- `pnpm build`: 타입을 검사하고 프로덕션 번들을 생성한다.
- `pnpm preview`: 빌드된 애플리케이션을 로컬에서 제공한다.
- `pnpm check`: 포맷, 린트, 타입 및 단위 테스트 검사를 실행한다.
- `pnpm test:watch`: 개발 중 변경 사항을 감지하여 테스트를 반복 실행한다.
- `pnpm test:coverage`: 테스트를 실행하고 V8 커버리지 보고서를 생성한다.
- `pnpm format` / `pnpm lint:fix`: 포맷 또는 린트 수정을 적용하고 결과 변경 사항을 검토한다.

## 코드 스타일 및 명명 규칙

TypeScript와 ES 모듈, 함수 컴포넌트를 사용한다. 컴포넌트 이름은 PascalCase(`App.tsx`), 변수와 함수 이름은 camelCase, 유틸리티 파일 이름은 kebab-case로 작성한다. 필요한 모듈은 명시적으로 import한다.

Prettier 설정은 `.prettierrc`를 기준으로 공백 2칸 들여쓰기, 작은따옴표, 세미콜론 생략, 후행 쉼표, LF 줄바꿈, 줄 너비 100자를 사용한다. 단, `src/components/ui/`는 shadcn CLI 생성 결과의 포맷을 보존하기 위해 `.prettierignore` 설정에 따라 포맷 검사·수정 대상에서 제외한다. 이 경로에 일괄 포맷을 적용하지 않는다.

린트는 `.oxlintrc.json`의 Oxlint 규칙을 따르며, `pnpm lint`는 경고가 발생해도 실패한다. React 훅 규칙을 준수하고, 커밋할 코드에 사용하지 않는 지역 변수와 매개변수를 남기지 않는다. `src/components/ui/**/*.tsx`에는 `react/only-export-components` 규칙만 예외로 적용하며, 나머지 린트 규칙은 유지한다.

### 타입스크립트

- 널 아님 단언 연산자를 지양한다. 단, 테스트에서 직접 만든 요소를 바로 찾는 경우에는 일부 허용한다.
- 타입 단언을 지양한다. 실제로 확인해서 타입을 좁히는 방법을 사용한다.
- Promise는 `await` 또는 반환으로 호출자에게 연결하고, 실패는 호출자나 명시적인 오류 처리에서 다룬다. 결과를 기다리지 않는 작업도 오류 처리를 생략하지 않는다.

## 테스트 가이드

Vitest와 함께 jsdom, React Testing Library, jest-dom, user-event를 사용한다. 테스트 파일 이름은 `*.test.ts` 또는 `*.test.tsx`로 작성한다. `src/App.test.tsx`를 참고하여 접근성을 고려한 쿼리와 사용자 상호작용으로 관찰 가능한 동작을 테스트한다. 테스트를 한 번 실행하려면 `pnpm test`를 사용한다. CI는 최소 임계값 설정 없이 커버리지를 수집하며, 동작 변경 시 관련 회귀 테스트를 추가한다.

새 기능과 버그 수정은 TDD로 진행한다. 기대 동작을 테스트로 작성하고 의도한 이유로 실패하는지 확인한 뒤, 최소 구현으로 통과시키고 테스트를 유지하며 리팩터링한다. 동작을 바꾸지 않는 문서·포맷 변경은 관련 문서와 설정 검사로 검증한다.

## Git 작업

- `git add`, `git commit`, `git push`는 절대 실행하지 않는다.

### 브랜치 전략

- 같은 기능의 구현, 테스트, 리팩터링, 문서는 하나의 기능 브랜치에서 작업한다.
- 작업이 바뀌거나 작업 종류가 달라져도 새 브랜치를 만들지 않는다.
- 브랜치 생성·전환·이름 변경·삭제는 사용자가 명시적으로 요청한 경우에만 수행한다.
- 다른 브랜치가 필요하다고 판단하면 이유를 설명하고 먼저 제안한다.
- 브랜치 이름은 `<타입>/<기능>` 형식을 사용한다. 예: `feat/sidebar-chat`.

### 커밋

- Git 커밋은 항상 사용자가 직접 수행한다.
- 변경이 끝나면 Conventional Commit 형식의 커밋 메시지를 추천한다. 메세지를 추천할 때는 변경 의도(왜)가 잘 드러나도록 작성한다. 간략한 커밋 제목과 내용은 불렛포인트로 간결하게 작성한다. Conventional Commits를 따르며 설명은 기존 이력처럼 한국어로 작성한다. 예: `fix: ebook 리더기 버그 수정`. 변경 의도와 이유를 중점으로 아래와 같이 세부 사항을 불렛포인트로 추가할 수 있다.

```
feat: ebook 사이드바 채팅 구현

- 페이지에 대한 추가 질문 버튼 추가
- UX를 위해 스트리밍으로 채팅 내용을 출력
```

### PR

- PR은 `.github/pull_request_template.md`에 맞춰 변경 요약, 맨 아래에는 관련 이슈(`Closes #123`)를, 구현 근거와 검증 결과를 적는다.

## 작업 원칙

`.specify/memory/constitution.md`를 따르고 명세 범위를 지킨다. 범위 변경 시 명세·계획부터 갱신한다.

### 한국어 글쓰기

- 한국어 커밋 메시지, PR 제목·본문, 이슈, 문서(스킬·Spec Kit·Markdown), 코드 주석을 작성하거나 다듬을 때는 [korean-dev-writing 스킬](.agents/skills/korean-dev-writing/SKILL.md)을 따른다.

### shadcn 디자인 시스템

- UI 구현과 검토는 설치된 [shadcn 스킬](.agents/skills/shadcn/SKILL.md)과 관련 참조 문서의 전체 규칙을 따른다.
  아래 요약으로 스킬을 대체하지 않는다. 디자인 기준은 [DESIGN.md](DESIGN.md)를 함께 확인한다.
- 스킬과 최신 공식 문서가 충돌하면 최신 공식 문서를 우선한다. 현재 프로젝트의 Base UI 기준 문서를 확인하고,
  검토 결과에 충돌한 규칙과 공식 근거를 기록한다. 충돌하지 않는 스킬 규칙은 계속 따른다.
- **테마 토큰 정의 → 필요한 컴포넌트 variant 선택·정의 → 서비스 컴포넌트 조합** 순서로 커스터마이징한다.
  색상·서체·모서리 등 사용 중인 디자인 값의 재정의는 `src/index.css`의 토큰에서 처리한다.
  라이트·다크 값과 `@theme inline`을 함께 관리하며, 토큰 값 변경을 위해 새 variant를 만들지 않는다.
- variant는 같은 역할의 컴포넌트 안에서 구분되는 표현 종류를 나타낸다. Button의 `default`·`outline`·`secondary`·`ghost` 등이 해당한다.
  기존 컴포넌트와 내장 `variant`·`size`를 먼저 사용하고, 기존 종류로 표현할 수 없는 별도 종류가 필요할 때만 variant를 추가한다.
  사용처의 `className`은 레이아웃에만 사용하며 색상·타이포그래피를 덮어쓰지 않는다.
- 서비스 컴포넌트는 `src/components/`의 `ui/` 밖에서 조합한다.
  대응하는 shadcn 컴포넌트가 있는 UI를 임의 마크업으로 재구현하지 않는다.
- CLI는 `pnpm dlx shadcn@latest`로 실행하고 설정·설치 목록·공식 문서를 먼저 확인한다.
  현재 Base UI에 맞는 API를 사용하고 동작·키보드 접근성·focus를 보존한다.
- 생성 코드도 스킬 검토 대상에 포함한다. 업스트림 갱신은 `--dry-run`·`--diff`로 확인하고 로컬 확장을 보존한다.
  레지스트리 선택·프리셋 변경·덮어쓰기 절차도 스킬을 따른다.

### Spec Kit 기반 SDD (개발 방식)

- 기본적으로 한 번에 하나의 작업만 구현한다.
- 현재 작업이 완료되면 다음 작업을 시작하지 말고 중단한다.
- 완료된 작업은 `tasks.md`에서 체크한다.
- 작업 완료 후 다음 내용을 보고한다:
  - 변경된 파일
  - 구현 내용
  - 테스트 결과
  - 추천 커밋 메시지 (메세지는 위 [커밋 전략](#커밋) 참고)

## 보안 및 설정

환경 변수는 `.env.example`을 기준으로 한다. 배포는 Vercel Git 연동으로 수행하며, 배포 환경 변수는 Vercel 프로젝트 설정에서 관리한다. Preview와 Production 배포 전 `pnpm check && pnpm build`를 실행한다. 인증 정보는 절대 커밋하지 않는다.
