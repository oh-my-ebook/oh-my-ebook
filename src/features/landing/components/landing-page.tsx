import { ArrowDown, ArrowRight, Fingerprint, Laptop, ScanText, TextSelect } from 'lucide-react'
import { Link } from 'react-router'
import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { BookCarousel } from './book-carousel'
import { ReadingDemo } from './reading-demo'

export function LandingPage() {
  return (
    <div className="landing">
      <a className="landing-skip" href="#main">
        본문으로 건너뛰기
      </a>
      <header className="border-b bg-card/92">
        <div className="landing-header">
          <Link className="landing-wordmark" to="/" aria-label="oh-my-ebook 홈">
            <img src="/landing/logo.jpg" alt="" width="32" height="32" />
            oh-my-ebook
          </Link>
          <nav aria-label="랜딩 탐색" className="landing-navigation">
            <a href="#features">읽는 경험</a>
            <a href="#privacy">나만의 공간</a>
          </nav>
          <Link className={buttonVariants({ variant: 'outline' })} to="/library">
            책장 열기
            <ArrowRight data-icon="inline-end" />
          </Link>
        </div>
      </header>
      <main id="main">
        <section className="landing-hero" aria-labelledby="hero-title">
          <BookCarousel />
          <p className="landing-eyebrow">내 PDF로 읽고, 질문하고, 이해하는 공간</p>
          <h1 id="hero-title">
            외부 업로드 없이,
            <br />
            <span>읽던 맥락 그대로.</span>
          </h1>
          <p className="landing-hero-description">
            전공 서적부터 PDF 기반 EBOOK까지
            <br />
            별도 챗봇에 맥락을 다시 설명할 필요 없이, 읽기와 이해에 집중하세요.
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
          <p className="landing-caption">회원가입 없이 시작 · PDF와 대화는 내 기기에</p>
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
              <p className="landing-eyebrow">PDF 학습을 위한 읽기 도구</p>
              <h2 id="features-title">
                PDF에도,
                <br />
                읽는 사람을 위한 배려.
              </h2>
            </div>
            <p>
              공부하던 전공 서적, 다시 펼친 강의 자료.
              <br />
              파일을 여는 일 다음의 경험을 생각했습니다.
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
                <div>
                  <span>가</span>
                  <p>
                    줄을 따라
                    <br />
                    단을 따라
                    <br />
                    자연스럽게
                  </p>
                </div>
                <ArrowRight size={22} />
                <div>
                  <span>나</span>
                  <p>
                    문장 순서도
                    <br />
                    띄어쓰기도
                    <br />
                    차근차근
                  </p>
                </div>
              </div>
              <p className="landing-eyebrow">02 / 읽기 순서와 한국어 보정</p>
              <h3>
                글자의 순서까지,
                <br />
                읽는 흐름에 맞춰.
              </h3>
              <p>
                여러 단으로 나뉜 페이지의 읽기 순서를 정리하고 한국어 띄어쓰기를 보정합니다. 선택한
                문장의 맥락을 더 잘 전달하도록.
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
          <p className="landing-eyebrow">읽던 자료에서, 다음 이해로</p>
          <h2 id="finish-title">
            읽다 멈춘 개념,
            <br />
            이제 질문하며 이해하세요.
          </h2>
          <Link className={buttonVariants({ size: 'lg' })} to="/library">
            나만의 책장 시작하기
            <ArrowRight data-icon="inline-end" />
          </Link>
          <p className="landing-caption">
            AI 기능은 WebGPU 지원 환경이 필요해요.
            <br />
            데스크톱 Chrome·Edge를 권장하며, 첫 사용 시 모델을 다운로드합니다.
          </p>
        </section>
      </main>
      <footer className="landing-footer">
        <Separator />
        <div>
          <Link className="landing-wordmark" to="/">
            <img src="/landing/logo.jpg" alt="" width="32" height="32" />
            oh-my-ebook
          </Link>
          <p>내 자료로 읽고, 질문하고, 이해하는 서재.</p>
          <nav aria-label="서비스 안내">
            <Link to="/privacy">개인정보처리방침</Link>
            <Link to="/terms">이용약관</Link>
            <Link to="/licenses">오픈소스 라이선스</Link>
          </nav>
        </div>
        <p className="landing-caption">
          © {new Date().getFullYear()} oh-my-ebook. All rights reserved. · 표지와 체험 본문은 이
          서비스를 위해 직접 제작했습니다.
        </p>
      </footer>
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
