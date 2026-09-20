const LAST_UPDATED = '2026-09-20'

export function TermsOfService() {
  return (
    <>
      <p>
        본 약관은 oh-my-ebook(이하 "서비스")의 이용 조건을 안내합니다. 서비스를 이용하면 아래 내용에
        동의한 것으로 간주됩니다.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">1. 서비스 소개</h2>
        <p>
          서비스는 별도의 서버 없이 브라우저에서 동작하는 개인용 전자책 리더입니다. 사용자가
          업로드한 PDF와 읽기 기록은 사용자의 브라우저에만 저장되며, 서비스 운영자는 이 데이터에
          접근하지 않습니다.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">2. 이용자의 책임</h2>
        <ul className="list-disc pl-5 [&>li]:mt-1">
          <li>
            업로드하는 PDF 등 콘텐츠에 대한 저작권 및 이용 권한은 이용자 본인에게 있으며, 관련
            법령을 준수할 책임은 이용자에게 있습니다.
          </li>
          <li>브라우저 저장 공간이 삭제되면 저장된 책과 읽기 기록이 함께 사라질 수 있습니다.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">3. 서비스 제공 및 변경</h2>
        <p>
          서비스는 개인이 무상으로 제공하는 오픈소스 프로젝트로, 사전 고지 없이 기능이 변경되거나
          중단될 수 있습니다. 서비스는 현재 상태("AS-IS")로 제공되며, 이용 중 발생하는 손해에 대해
          운영자는 관련 법령이 허용하는 범위에서 책임을 지지 않습니다.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">4. 오픈소스 라이선스</h2>
        <p>
          서비스는 다양한 오픈소스 라이브러리를 사용합니다. 사용한 라이브러리와 라이선스 목록은{' '}
          <a className="text-primary underline underline-offset-4" href="/licenses">
            오픈소스 라이선스
          </a>{' '}
          페이지에서 확인할 수 있습니다.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">5. 문의</h2>
        <p>
          이용약관에 관해 궁금한 점은{' '}
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
