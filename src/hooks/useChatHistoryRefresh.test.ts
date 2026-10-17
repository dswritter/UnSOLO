// @vitest-environment happy-dom
import { useState } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '@/types'
import { useChatHistoryRefresh } from './useChatHistoryRefresh'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/chat/fetchRoomMessages', () => ({ fetchRoomMessagesClient: mocks.fetch }))
vi.mock('sonner', () => ({ toast: { error: mocks.error } }))

const message = (id: string, day: number): Message => ({
  id, created_at: `2026-10-${String(day).padStart(2, '0')}T00:00:00Z`,
  room_id: 'room', content: id, user_id: 'traveller', message_type: 'text', is_edited: false,
})

let height = 1000
let el: HTMLDivElement

function mount() {
  const scrollRef = { current: el }
  return renderHook(() => {
    const [messages, setMessages] = useState([message('recent', 10)])
    const history = useChatHistoryRefresh('room', messages, scrollRef, updater => {
      height = 1200
      setMessages(updater)
    })
    return { ...history, messages }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  el = document.createElement('div')
  height = 1000
  Object.defineProperty(el, 'scrollHeight', { get: () => height })
  Object.defineProperty(el, 'clientHeight', { value: 400 })
  el.scrollTop = 0
})
afterEach(cleanup)

describe('chat top-edge refresh', () => {
  it('loads earlier history, merges without duplicates and preserves the reading position', async () => {
    mocks.fetch.mockImplementation((_room, before) => Promise.resolve(before
      ? [message('older', 9)] : [message('recent', 10)]))
    const { result } = mount()
    await act(() => result.current.refreshHistory())
    expect(mocks.fetch).toHaveBeenCalledWith('room', '2026-10-10T00:00:00Z')
    expect(mocks.fetch).toHaveBeenCalledWith('room')
    expect(result.current.messages.map(row => row.id)).toEqual(['older', 'recent'])
    expect(el.scrollTop).toBe(200)
    expect(result.current.consumeHistoryChange()).toBe(true)
    expect(result.current.consumeHistoryChange()).toBe(false)
  })

  it('accepts a downward pull only at the top, not a horizontal swipe or a short gesture', async () => {
    mocks.fetch.mockResolvedValue([])
    const { result } = mount()
    const touch = (x: number, y: number) => ({ clientX: x, clientY: y })
    const start = (x: number, y: number) => result.current.pullHandlers.onTouchStart({ touches: [touch(x, y)] } as unknown as React.TouchEvent<HTMLDivElement>)
    const end = (x: number, y: number) => result.current.pullHandlers.onTouchEnd({ changedTouches: [touch(x, y)] } as unknown as React.TouchEvent<HTMLDivElement>)
    await act(async () => { start(0, 0); end(100, 70) })
    await act(async () => { start(0, 0); end(0, 40) })
    el.scrollTop = 100
    await act(async () => { start(0, 0); end(0, 100) })
    expect(mocks.fetch).not.toHaveBeenCalled()
    el.scrollTop = 0
    await act(async () => { start(0, 0); end(0, 80) })
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })

  it('prevents concurrent requests and keeps existing messages on errors', async () => {
    let reject: (error: Error) => void = () => {}
    mocks.fetch.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail }))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { result } = mount()
    let pending: Promise<void>
    act(() => { pending = result.current.refreshHistory() })
    await act(() => result.current.refreshHistory())
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    await act(async () => { reject(new Error('Offline')); await pending })
    expect(mocks.error).toHaveBeenCalledWith('Unable to refresh messages. Please try again.')
    expect(result.current.messages.map(row => row.id)).toEqual(['recent'])
    expect(result.current.refreshing).toBe(false)
    consoleError.mockRestore()
  })

  it('refreshes on upward overscroll, not normal scrolling, and throttles trackpad momentum', async () => {
    mocks.fetch.mockResolvedValue([])
    const { result } = mount()
    const wheel = (deltaY: number) => result.current.pullHandlers.onWheel({ deltaY, deltaMode: 0 } as React.WheelEvent<HTMLDivElement>)
    el.scrollTop = 100
    await act(async () => wheel(-100))
    expect(mocks.fetch).not.toHaveBeenCalled()
    el.scrollTop = 0
    await act(async () => wheel(-30))
    expect(mocks.fetch).not.toHaveBeenCalled()
    await act(async () => wheel(-60))
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
    el.scrollTop = 0
    await act(async () => wheel(-100))
    expect(mocks.fetch).toHaveBeenCalledTimes(2)
  })
})
