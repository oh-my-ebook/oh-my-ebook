import { LegalPageLayout } from '@/features/legal/components/legal-page-layout'
import { PrivacyPolicy } from '@/features/legal/components/privacy-policy'

export function PrivacyPolicyPage() {
  return (
    <LegalPageLayout title="개인정보처리방침">
      <PrivacyPolicy />
    </LegalPageLayout>
  )
}
