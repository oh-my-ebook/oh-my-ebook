import { ArrowDown, ArrowRight, Fingerprint, Laptop, ScanText, TextSelect } from 'lucide-react'
import { Link } from 'react-router'
import { AppFooter } from '@/components/app-footer'
import { AppHeader } from '@/components/app-header'
import { buttonVariants } from '@/components/ui/button'
import { BookCarousel } from './book-carousel'
import { ReadingDemo } from './reading-demo'

export function LandingPage() {
  return (
    <div className="landing">
      <a className="landing-skip" href="#main">
        본문으로 건너뛰기
      </a>
      <AppHeader navigationLabel="랜딩 탐색">
        <a className="text-sm text-muted-foreground max-[700px]:hidden" href="#features">
          읽는 경험
        </a>
        <a className="text-sm text-muted-foreground max-[700px]:hidden" href="#privacy">
          나만의 공간
        </a>
        <Link className={buttonVariants({ variant: 'outline' })} to="/library">
          책장 열기
          <ArrowRight data-icon="inline-end" />
        </Link>
      </AppHeader>
      <main id="main">
        <section className="landing-hero" aria-labelledby="hero-title">
          <BookCarousel />
          <p className="landing-eyebrow">PDF 전자책을 위한 몰입형 리더</p>
          <h1 id="hero-title">
            책 밖으로 나가지 않고,
            <br />
            <span>읽던 맥락 그대로.</span>
          </h1>
          <p className="landing-hero-description">
            PDF로 된 전자책도 읽다가 바로 질문하세요.
            <br />
            다른 앱을 열거나 책의 맥락을 다시 설명할 필요가 없습니다.
          </p>
          <div className="landing-actions">
            <Link className={buttonVariants({ size: 'lg' })} to="/library">
              내 PDF로 시작하기
              <ArrowRight data-icon="inline-end" />
            </Link>
            <a className={buttonVariants({ variant: 'ghost', size: 'lg' })} href="#try">
              먼저 체험해 보기
              <ArrowDown data-icon="inline-end" />
            </a>
          </div>
          <p className="landing-caption">
            회원가입 없이 시작 · PDF는 외부 서버에 업로드하지 않아요
          </p>
        </section>
        <div className="landing-proof">
          <span>
            <ScanText size={17} aria-hidden="true" />
            스캔 PDF도 문장으로
          </span>
          <span>
            <TextSelect size={17} aria-hidden="true" />
            선택한 문장에서 이어지는 질문
          </span>
          <span>
            <Laptop size={17} aria-hidden="true" />내 브라우저 안의 AI
          </span>
        </div>
        <ReadingDemo />
        <section id="features" className="landing-section" aria-labelledby="features-title">
          <div className="landing-feature-intro">
            <div>
              <p className="landing-eyebrow">독서 흐름을 끊지 않는 PDF 리더</p>
              <h2 id="features-title">
                읽다가 궁금한 순간,
                <br />
                흐름을 놓치지 않고 바로 질문하세요.
              </h2>
            </div>
            <p>
              궁금한 문장이 나올 때마다 다른 AI를 열고 책의 맥락을 다시 설명하지 않아도 돼요.
              <br />
              PDF 전자책을 읽던 화면에서 바로 묻고, 답을 확인한 뒤 이어서 읽으세요.
            </p>
          </div>
          <div className="landing-feature-grid">
            <article className="landing-feature">
              <div className="landing-scan-illustration" aria-hidden="true">
                <div>
                  <span>01 / SCANNED PAGE</span>
                  <p>
                    종이 위의 문장이
                    <br />
                    <mark>다시 살아나는 순간.</mark>
                  </p>
                  <i />
                  <i />
                  <i />
                </div>
                <ScanText size={26} />
              </div>
              <p className="landing-eyebrow">01 / 스캔 PDF의 글자 인식</p>
              <h3>
                이미지였던 페이지가,
                <br />
                선택할 수 있는 문장으로.
              </h3>
              <p>
                스캔 PDF의 글자를 인식해 원래 페이지 위에 올립니다. 따로 변환할 필요 없이 선택하고,
                복사하고, 질문하세요.
              </p>
            </article>
            <article className="landing-feature">
              <div className="landing-order-illustration" aria-hidden="true">
                <div className="landing-order-spread">
                  <div className="landing-order-page">
                    <div className="landing-order-column">
                      <span>1</span>
                      <i />
                      <i />
                      <i data-selected="true" />
                      <i />
                    </div>
                    <div className="landing-order-column">
                      <span>2</span>
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                  <div className="landing-order-fold" />
                  <div className="landing-order-page">
                    <div className="landing-order-column">
                      <span>3</span>
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className="landing-order-column">
                      <span>4</span>
                      <i />
                      <i data-selected="true" />
                      <i />
                      <i />
                    </div>
                  </div>
                </div>
                <div className="landing-order-selection">
                  <TextSelect size={18} />
                  <span>읽는 순서대로 선택</span>
                </div>
              </div>
              <p className="landing-eyebrow">02 / 읽기 순서와 한국어 보정</p>
              <h3>
                복잡하게 나뉜 페이지도,
                <br />
                읽는 순서 그대로.
              </h3>
              <p>
                펼친 두 페이지를 한 번에 스캔했거나 시험 문제처럼 여러 단으로 구성된 페이지도, 읽는
                순서대로 글자를 인식합니다. 띄어쓰기를 보정해 문장도 자연스럽게 드래그해 선택할 수
                있어요.
              </p>
            </article>
          </div>
        </section>
        <section
          id="privacy"
          className="landing-private landing-section"
          aria-labelledby="privacy-title"
        >
          <div className="landing-private-art" aria-hidden="true">
            <div className="landing-orbit landing-orbit-outer" />
            <div className="landing-orbit landing-orbit-inner" />
            <div className="landing-private-book">
              <img src="/landing/operating-systems.svg" alt="" width="310" height="450" />
              <span>
                <Fingerprint size={30} />
              </span>
            </div>
            <p>내 기기에 보관되는 자료</p>
          </div>
          <div>
            <p className="landing-eyebrow">내 브라우저 안에서 처리</p>
            <h2 id="privacy-title">
              나의 책, 나의 질문.
              <br />
              머무는 곳도 내 기기.
            </h2>
            <p>
              책을 읽기 위해, 책을 서버에 맡길 필요는 없으니까요. PDF 보관부터 글자 인식, AI 답변
              생성까지 브라우저 안에서 처리합니다.
            </p>
            <ul>
              <li>
                <CheckMark />
                PDF 본문과 대화를 외부 AI 서버로 보내지 않아요.
              </li>
              <li>
                <CheckMark />
                계정이나 별도의 AI 구독 없이 시작해요.
              </li>
              <li>
                <CheckMark />
                읽던 위치를 기억해 다음 독서로 이어져요.
              </li>
            </ul>
            <Link className={buttonVariants({ variant: 'link' })} to="/privacy">
              개인정보 처리 방식 자세히 보기
              <ArrowRight data-icon="inline-end" />
            </Link>
          </div>
        </section>
        <section className="landing-finish landing-section" aria-labelledby="finish-title">
          <p className="landing-eyebrow">질문도 답도, 읽던 PDF 안에서</p>
          <h2 id="finish-title">
            다른 AI로 옮겨 갈 필요 없이,
            <br />한 권을 더 깊이 이해하세요.
          </h2>
          <Link className={buttonVariants({ size: 'lg' })} to="/library">
            나만의 책장 시작하기
            <ArrowRight data-icon="inline-end" />
          </Link>
          <p className="landing-caption">
            AI 기능은 WebGPU와 필요한 GPU 기능을 지원하는 환경에서만 사용할 수 있어요.
            <br />
            모바일이나 일부 브라우저·기기에서는 실행되지 않을 수 있습니다.
            <br />
            데스크톱 Chrome·Edge를 권장하며, 첫 사용 시 모델을 다운로드합니다.
          </p>
        </section>
      </main>
      <AppFooter />
    </div>
  )
}

function CheckMark() {
  return (
    <span className="landing-check" aria-hidden="true">
      ✓
    </span>
  )
}
