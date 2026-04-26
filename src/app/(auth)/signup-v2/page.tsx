import type { Metadata } from 'next'
import { AuthV2Shell } from '@/components/auth/v2/AuthV2Shell'
import { SignupV2Form } from '@/components/auth/v2/SignupV2Form'

export const metadata: Metadata = {
  title: 'Sign up (preview) — UnSOLO',
  description: 'Preview of the upcoming sign-up experience. The current live page remains at /signup.',
  robots: { index: false, follow: false },
}

export default function SignupV2Page() {
  return (
    <AuthV2Shell mode="signup">
      <SignupV2Form />
    </AuthV2Shell>
  )
}
