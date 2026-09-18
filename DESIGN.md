---
version: alpha
name: oh-my-ebook
description: 읽기·질문·근거 확인에 집중하는 전자책 리더
colors:
  primary: '#1F201C'
  primary-foreground: '#F4F3EE'
  background: '#EEEAE0'
  card: '#F9F5EB'
  muted: '#E9E5D7'
  muted-foreground: '#4A4840'
  border: '#E0DBCC'
  input: '#7E7B6F'
  accent: '#E5EDE4'
  destructive: '#A6512F'
  reader-page: '#FAF7EF'
  reader-link: '#3A6B55'
  reader-highlight: '#FFF8D0'
  reader-code: '#201F1A'
  reader-code-foreground: '#E7E3D6'
  dark-primary: '#DBD7CA'
  dark-primary-foreground: '#1A1915'
  dark-background: '#181714'
  dark-card: '#201F1A'
  dark-muted: '#2F2D26'
  dark-muted-foreground: '#948F80'
  dark-border: '#3D3A33'
  dark-input: '#948F80'
  dark-accent: '#26322B'
  dark-destructive: '#D98A63'
  dark-reader-page: '#1A1915'
  dark-reader-link: '#86B99C'
  dark-reader-highlight: '#26322B'
  dark-reader-code: '#100F0D'
  dark-reader-code-foreground: '#D6D1C4'
typography:
  headline:
    fontFamily: Pretendard
    fontSize: 48px
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: -0.04em
  book-title:
    fontFamily: Pretendard
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: Pretendard
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6
  book-body:
    fontFamily: MaruBuri
    fontSize: 17px
    fontWeight: 400
    lineHeight: 2
  meta:
    fontFamily: Pretendard
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
  code:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.8
rounded:
  reader-page: 2px
spacing:
  reader-spread-gap: 16px
  reader-page-mobile: 24px
---

# 같은 페이지

## Overview

긴 글을 읽고 질문하며 근거를 확인하는 차분한 전자책 리더.
Figma Make에서 추출한 따뜻한 종이색·짙은 잉크색·절제된 녹색과 서체·배치로 본문에 집중한다.
일반 컴포넌트는 shadcn Nova를 기반으로 디자인 값을 테마 토큰에서 관리하고 표현 종류를 variant로 구분한다.
문서 형식은 [DESIGN.md 명세](https://stitch.withgoogle.com/docs/design-md/specification/)를 따르며,
YAML은 토큰 값, 본문은 적용 규칙을 정의한다.

## Colors

- [shadcn 테마 방식](https://ui.shadcn.com/docs/theming)에 따라 `tailwind.cssVariables: true`를 유지한다.
  `src/index.css`의 `:root`에 라이트 값을, `.dark`에 같은 변수의 다크 값을 정의하고 `<html class="dark">`로 전환한다.
  YAML의 `dark-*`는 다크 값 표기이며 별도 CSS 변수명이 아니다.
- `@theme inline`의 `--color-*`에 일반·`reader-*` 토큰을 연결하고 `bg-background`, `text-reader-link` 등 의미 클래스로 사용한다.
- 중복 색 매핑: `foreground/card-foreground/popover-foreground/sidebar-foreground/sidebar-primary`는 `primary`,
  `popover/sidebar`는 `card`, 라이트 `secondary-foreground`는 `muted-foreground`, 다크 `secondary-foreground`는 `foreground`,
  `accent-foreground/ring/sidebar-accent-foreground/sidebar-ring`은 `reader-link`와 같은 값이다.
  `sidebar-primary-foreground/sidebar-accent/sidebar-border`는 대응하는 일반 토큰과 같은 값이다.
- Figma Make의 HEX 값을 보존한다. `muted`는 배경과 구분되는 면 색으로 기본 hover를 표현한다.
- `secondary`는 눌린 버튼(목차·함께 읽기 패널·높이 맞춤)의 면 색으로, `card` 위에서 hover(`muted`)보다 한 단계 진하게 보이도록 둔다.

## Typography

- [Tailwind 폰트 테마](https://tailwindcss.com/docs/font-family#customizing-your-theme)의 `@theme inline`에
  `--font-sans/--font-serif/--font-mono`를 Pretendard·MaruBuri·JetBrains Mono와 시스템 폴백으로 등록한다.
  `--font-heading`은 sans를 따르고 루트는 `font-sans`를 쓴다. 실제 폰트도 로딩하며 `font-display: swap`을 유지한다.
- YAML의 크기·행간·굵기는 페이지 콘텐츠용이며, 일반 컴포넌트는 Nova 기본값을 우선한다.
  공통 디자인 값의 변경은 해당 토큰에서 처리한다. 같은 컴포넌트에 별도 표현 종류가 필요할 때만 variant로 구분하고,
  사용처에서 타이포그래피를 덮어쓰지 않는다.
- 책 본문은 양 테마 굵기 400·강조 600, 왼쪽 정렬·`word-break: keep-all`을 사용하고 긴 토큰은 줄바꿈한다.
  사용자 글자 크기·행간 설정을 우선하며, 페이지 번호는 고정폭 숫자로 표시한다.
- 랜딩 제목은 좁은 화면에서 32px까지 줄인다. PDF 원본의 글꼴·조판은 유지한다.

## Layout

- 아래 수치와 spacing 토큰은 페이지·전자책 배치 전용이다.
  `@theme`의 `--spacing-reader-*`에 연결해 `gap-reader-spread-gap`로 사용한다.
- 랜딩 최대 폭 900px, 좌우 여백 16–32px.
- 리더 상·하단 바는 최소 48px. 중앙 지면과 오른쪽 320px 질문 패널은 각각 스크롤한다.
- HTML 지면은 단면 최대 640px, 안쪽 여백은 데스크톱 세로 72px·가로 80px, 모바일 24px.
  PDF는 원본 비율과 확대값을 따른다. 푸터가 본문에 겹치지 않게 한다.
- 1024px 미만은 단면과 Sheet형 질문 패널. 목차는 넓은 화면에서 읽기 영역 왼쪽에 폭 280px로 붙이고, 좁은 화면에서는 Sheet로 연다.
  양면은 화면 폭 1024px 이상에서 제공하고, 최대 1100px·간격 16px로 배치한다.

## Elevation & Depth

전자책은 배경·지면·패널의 면 색과 1px 구분선으로 계층을 만든다.
라이트 지면만 `0 1px 8px rgb(31 32 28 / 6%)` 그림자를 사용하며 다크 지면은 그림자를 없앤다.

## Shapes

일반 컴포넌트는 shadcn Nova의 모서리와 radius 스케일을 유지한다.
독서 지면만 `reader-page` 모서리 2px를 적용한다.

## Components

shadcn Nova(Base UI)로 통일하고 필요한 컴포넌트만 설치한다.
설치된 [shadcn 스킬](.agents/skills/shadcn/SKILL.md)과 관련 참조 문서의 전체 규칙을 따른다.
스킬과 최신 공식 문서가 충돌하면 현재 Base UI 기준의 최신 공식 문서를 우선하고, 충돌하지 않는 스킬 규칙은 유지한다.
커스터마이징은 **테마 토큰 정의 → 필요한 컴포넌트 variant 선택·정의 → 서비스 컴포넌트 조합** 순서로 한다.
일반 컴포넌트는 Nova 기본값을 우선한다. 사용 중인 디자인 값의 재정의는 토큰에서 처리하고,
같은 역할의 컴포넌트 안에서 구분되는 표현 종류는 variant로 나타낸다. 모든 디자인 변경에 새 variant를 만들지 않는다.

- `src/index.css`: 의미 기반 테마 토큰을 정의한다. 새 토큰도 이 파일의 라이트·다크 값과 Tailwind 연결로 관리한다.
  예를 들어 기본 강조 색을 바꾸려면 `--primary`와 필요한 경우 `--primary-foreground`를 재정의한다.
  이 토큰을 사용하는 모든 컴포넌트에 미치는 영향을 확인하며 색상 변경만을 위한 variant는 추가하지 않는다.
- `src/components/ui/`: CLI로 추가한 컴포넌트의 기존 variant를 우선 사용한다.
  Button의 `default`·`outline`·`secondary`·`ghost`처럼 같은 역할 안에서 별도 표현 종류가 필요할 때만 의미 토큰으로 variant를 확장한다.
  외부 CSS로 기본 형태·상태를 덮어쓰지 않는다. 업스트림 갱신 시 diff를 확인하고 로컬 확장을 보존한다.
- `src/components/` (`ui/` 제외): 여러 기능에서 사용하는 서비스 공통 UI를 조합한다.
- `src/features/<기능>/components/`: 해당 기능 전용 UI를 기존 공통 컴포넌트로 조합한다.
  `className`은 레이아웃에만 사용한다. 정적 콘텐츠는 시맨틱 HTML을 쓰되,
  Button·Separator·Badge·Empty 등 대응 컴포넌트가 있는 UI를 직접 재구현하지 않는다.
- 기존 `variant`·`size`와 공식 조합 API를 우선한다. 새로운 표현 종류가 필요하면 [CVA](https://cva.style/getting-started/variants/)의
  `variants/defaultVariants`·`VariantProps`로 정의하고, 필요한 조합 조건은 `compoundVariants`로 표현한다.
- 버튼 모양의 탐색 링크는 [공식 Button 문서](https://ui.shadcn.com/docs/components/base/button#as-link)에 따라
  `<a>`에 `buttonVariants`를 적용한다. 스킬의 `Button render={<a />} nativeButton={false}` 예시보다 공식 문서를 우선해 링크 의미를 보존한다.
- 조건부 클래스와 Tailwind 충돌은 `@/lib/utils`의 `cn`으로 병합한다. CVA는 클래스 선택만 담당하며,
  동작·접근성은 shadcn 또는 Base UI primitive로 구성하고 props·ref·이벤트·focus를 보존한다.

전자책 UI는 위 컴포넌트를 조합한다.

| 요소           | 규칙                                                                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 독서 지면      | `reader-page` 바탕에 읽기 폭·조판·테마를 관리한다. 텍스트 선택과 확대를 유지하며 PDF를 일괄 반전하지 않는다.                                                                     |
| 독서 위치 바   | 이전·다음, 현재/전체 페이지, 확대율을 표시한다. PDF 페이지와 인쇄 쪽수가 다르면 구분한다.                                                                                        |
| 근거 카드      | shadcn Card의 기본 모서리·패딩을 유지하고 인용문과 장·쪽수를 표시한다. 이동 행동은 Button으로 제공한다. 선택하면 원문으로 이동하고 대상 문장에 highlight와 위치 표식을 적용한다. |
| 읽던 곳으로    | 근거 이동 직전 페이지·스크롤 위치를 보관한다. 복귀 버튼은 원래 위치와 읽기 focus를 복원한다.                                                                                     |
| 선택 문장 질문 | 선택 영역 가까이에 질문 버튼을 표시한다. 선택 문맥을 입력창에 붙이고 수정·취소할 수 있게 한다.                                                                                   |
| 함께 읽기 패널 | 대화·질문 노트 Tabs, 스크롤 대화, 하단 질문 입력으로 구성한다. 근거 없는 답변은 원문을 찾지 못했다고 표시한다.                                                                   |

## Do's and Don'ts

- 읽을 글자는 4.5:1 이상, 식별에 필요한 경계는 3:1 이상을 확보한다. 연한 `border`는 구분선에,
  `input`은 입력 경계에 사용한다. 설명·메타는 대비를 보정한 `muted-foreground`를 쓴다.
- 키보드 focus를 표시하고 아이콘 버튼에 이름을 붙인다. 오류·선택 상태는 색 외의 단서도 제공한다.
- Sheet를 닫으면 트리거로 focus를 돌린다. 새 답변은 입력 focus를 빼앗지 않고 상태를 알린다.
- 320px 폭·200% 확대에서 내용과 조작부를 보존한다. 전자책 전용 모션은 120–240ms, 동작 감소 설정에서는 제거한다.
- 장식용 진단 지표, 무관한 브랜드 자산, 화면별 임의 색상과 과도한 그림자를 추가하지 않는다.
