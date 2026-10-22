// @vitest-environment happy-dom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { checkVerificationStatus } from '@/actions/verification'
import type { PayoutDetails } from '@/actions/payout'

const mocks = vi.hoisted(() => ({ status: vi.fn(), payout: vi.fn(), sendOTP: vi.fn(), toastError: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/actions/verification', () => ({
  checkVerificationStatus: mocks.status,
  sendPhoneOTP: mocks.sendOTP, verifyPhoneOTP: vi.fn(), resendEmailVerification: vi.fn(),
  submitForeignPhoneForReview: vi.fn(), requestPhoneChange: vi.fn(), cancelPhoneChangeRequest: vi.fn(),
}))
vi.mock('@/actions/payout', () => ({ getPayoutDetails: mocks.payout }))
vi.mock('@/components/hosting/PayoutDetailsForm', () => ({ PayoutDetailsForm: () => null }))
import { HostVerifyClient } from './HostVerifyClient'

const status: NonNullable<Awaited<ReturnType<typeof checkVerificationStatus>>> = {
  isHost: false, isPhoneVerified: false, isEmailVerified: true, phoneNumber: null,
  phoneCountryCode: '+91', phoneVerifiedMethod: null, pendingChangeRequest: null,
  otpSendCooldownUntil: null,
}
const initialPayout: PayoutDetails = {
  upi_id: null, bank_account_name: null, bank_account_number: null, bank_ifsc: null, payout_method: 'upi',
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('verification first render', () => {
  it('renders the current verification step in server HTML, not a loading spinner', () => {
    const html = renderToStaticMarkup(createElement(HostVerifyClient, { status, initialPayout }))
    expect(html).toContain('Send OTP')
    expect(html).not.toContain('animate-spin')
  })
  it('does not issue status or payout server actions after hydration', async () => {
    render(createElement(HostVerifyClient, { status, initialPayout }))
    await screen.findByText('Send OTP')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(mocks.status).not.toHaveBeenCalled()
    expect(mocks.payout).not.toHaveBeenCalled()
  })
  it('retains the OTP cooldown passed from the server', async () => {
    const cooldownStatus = { ...status, otpSendCooldownUntil: new Date(Date.now() + 60000).toISOString() }
    render(createElement(HostVerifyClient, { status: cooldownStatus, initialPayout }))
    await waitFor(() => {
      const send = screen.getByRole('button', { name: /wait/i })
      expect(send.hasAttribute('disabled')).toBe(true)
    })
  })
  it('renders a pending foreign-phone review immediately', () => {
    const html = renderToStaticMarkup(createElement(HostVerifyClient, {
      status: { ...status, phoneNumber: '1234567890', phoneCountryCode: '+977' }, initialPayout,
    }))
    expect(html).toContain('Verification in Progress')
    expect(html).toContain('+977')
  })
  it('reports a failed OTP action and re-enables sending', async () => {
    mocks.sendOTP.mockRejectedValue(new Error('Cooldown database unavailable'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(createElement(HostVerifyClient, { status, initialPayout }))
      fireEvent.change(screen.getByPlaceholderText('10-digit number'), { target: { value: '9876543210' } })
      fireEvent.click(screen.getByRole('button', { name: 'Send OTP' }))
      await waitFor(() => {
        expect(mocks.toastError).toHaveBeenCalledWith('Could not send OTP. Please try again.')
        expect(screen.getByRole('button', { name: 'Send OTP' }).hasAttribute('disabled')).toBe(false)
      })
    } finally {
      errorLog.mockRestore()
    }
  })
})
