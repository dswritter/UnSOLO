// @vitest-environment happy-dom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ google: vi.fn() }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('redirectTo=%2Fhost&ref=FRIEND') }))
vi.mock('@/actions/auth', () => ({
  signIn: vi.fn(), signUp: vi.fn(), signInWithGoogle: mocks.google, resendSignupConfirmationEmail: vi.fn(),
}))
import { LoginV2Form } from './LoginV2Form'
import { SignupV2Form } from './SignupV2Form'

beforeEach(() => { vi.clearAllMocks(); mocks.google.mockResolvedValue({ error: 'Please retry' }) })
afterEach(() => cleanup())

describe('Google-first authentication', () => {
  for (const [name, Form] of [['login', LoginV2Form], ['signup', SignupV2Form]] as const) {
    it(`${name} places Google before email without forcing keyboard focus`, async () => {
      render(createElement(Form))
      const google = screen.getByRole('button', { name: 'Continue with Google' })
      const email = document.querySelector('input[type="email"]')!
      expect(google.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      await new Promise(resolve => setTimeout(resolve, 150))
      expect(document.activeElement).not.toBe(email)
      fireEvent.click(google)
      await waitFor(() => expect(mocks.google).toHaveBeenCalledWith(name === 'login'
        ? { redirectTo: '/host' } : { redirectTo: '/host', referralCode: 'FRIEND' }))
      expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Please retry'))
    })
  }
})

describe('compact email forms', () => {
  it('login uses accessible placeholder hints and keeps password recovery', () => {
    render(createElement(LoginV2Form))
    expect(screen.getByLabelText('Email')).toHaveProperty('placeholder', 'Email address')
    expect(screen.getByLabelText('Password')).toHaveProperty('placeholder', 'Password')
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toBeTruthy()
  })

  it('signup reveals confirm password only after a password is entered', () => {
    render(createElement(SignupV2Form))
    expect(screen.queryByLabelText('Confirm password')).toBeNull()
    fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'secret12' } })
    expect(screen.getByLabelText('Confirm password')).toHaveProperty('placeholder', 'Confirm password')
  })
})
