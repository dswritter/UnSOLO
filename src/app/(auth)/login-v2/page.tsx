import type { Metadata } from 'next'
import { AuthV2Shell } from '@/components/auth/v2/AuthV2Shell'
import { LoginV2Form } from '@/components/auth/v2/LoginV2Form'

export const metadata: Metadata = {
  title: 'Log in (preview) — UnSOLO',
  description: 'Preview of the upcoming sign-in experience. The current live page remains at /login.',
  robots: { index: false, follow: false },
}

export default function LoginV2Page() {
  return (
    <AuthV2Shell mode="login">
      <LoginV2Form />
    </AuthV2Shell>
  )
}
