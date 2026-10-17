// @vitest-environment happy-dom
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SoundSettingsButton } from './SoundSettings'
import { getNotificationSettings } from '@/lib/notifications/soundController'

beforeEach(() => { vi.stubGlobal('localStorage', window.sessionStorage); localStorage.clear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('notification sound switches', () => {
  it('shows On at the right, Off at the left, and persists each category', () => {
    render(createElement(SoundSettingsButton))
    fireEvent.click(screen.getByRole('button', { name: 'Notification sound settings' }))
    const dm = screen.getByRole('switch', { name: 'DMs notification sounds' })
    expect(dm.getAttribute('aria-checked')).toBe('true')
    expect(dm.textContent).toBe('On')
    expect(dm.innerHTML).toContain('translate-x-4')
    fireEvent.click(dm)
    expect(dm.getAttribute('aria-checked')).toBe('false')
    expect(dm.textContent).toBe('Off')
    expect(dm.innerHTML).toContain('translate-x-0')
    expect(getNotificationSettings().muteDMs).toBe(true)
    expect(screen.getByRole('switch', { name: 'Trips notification sounds' }).getAttribute('aria-checked')).toBe('true')
  })

  it('turns all sound off when every category is off and restores it when one is enabled', () => {
    render(createElement(SoundSettingsButton))
    fireEvent.click(screen.getByRole('button', { name: 'Notification sound settings' }))
    for (const toggle of screen.getAllByRole('switch')) fireEvent.click(toggle)
    expect(getNotificationSettings().soundEnabled).toBe(false)
    expect(screen.getByText('All sounds muted')).toBeTruthy()
    fireEvent.click(screen.getByRole('switch', { name: 'Community notification sounds' }))
    expect(getNotificationSettings().soundEnabled).toBe(true)
    expect(getNotificationSettings().muteCommunity).toBe(false)
  })
})
