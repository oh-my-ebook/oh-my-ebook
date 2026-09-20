const LAST_UPDATED = '2026-09-20'

export function PrivacyPolicy() {
  return (
    <>
      <p>
        oh-my-ebook(이하 "서비스")은 별도의 서버 없이 브라우저에서만 동작하는 오프라인 전자책
        리더입니다. 이 방침은 서비스가 개인정보를 어떻게 다루는지 설명합니다.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">1. 수집하는 개인정보</h2>
        <p>
          서비스는 회원가입이나 로그인을 요구하지 않으며, 이름·이메일 등 개인을 식별할 수 있는
          정보를 별도로 수집하지 않습니다. 업로드한 PDF, 읽은 위치, 목차·페이지 캡처 결과 등 서비스
          이용 데이터는 사용자 브라우저의 로컬 저장소(OPFS, IndexedDB)에만 저장되며 외부 서버로
          전송되지 않습니다.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">2. 외부 서비스로 전달되는 정보</h2>
        <ul className="list-disc pl-5 [&>li]:mt-1">
          <li>
            서비스는 Vercel을 통해 호스팅됩니다. 웹사이트에 접속하면 호스팅 제공자가 통상적인 웹서버
            접속 로그(IP 주소, 접속 시간, 요청 경로 등)를 처리할 수 있습니다.
          </li>
          <li>
            AI 문서 분석·채팅 기능에 사용하는 언어모델 파일은 브라우저가 Hugging Face 등 외부
            CDN에서 직접 내려받습니다. 이 과정에서 해당 서비스에 IP 주소 등 접속 정보가 전달될 수
            있으며, 업로드한 책의 내용이나 대화 내용 자체가 전송되지는 않습니다. 모델 추론은
            전적으로 사용자 브라우저 안에서 실행됩니다.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">3. 보관 및 삭제</h2>
        <p>
          책과 읽기 기록은 브라우저의 로컬 저장소에만 남으며, 브라우저에서 책을 삭제하거나 사이트
          데이터를 지우면 함께 삭제됩니다. 서비스는 별도의 데이터베이스에 사용자 데이터를 보관하지
          않으므로, 삭제 요청을 처리할 서버 측 데이터가 존재하지 않습니다.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">4. 문의</h2>
        <p>
          개인정보 처리에 관해 궁금한 점은{' '}
          <a
            className="text-primary underline underline-offset-4"
            href="https://github.com/oh-my-ebook/oh-my-ebook/issues"
            rel="noreferrer"
            target="_blank"
          >
            GitHub 이슈
          </a>
          로 문의해 주세요.
        </p>
      </section>

      <p className="text-muted-foreground">시행일: {LAST_UPDATED}</p>
    </>
  )
}
