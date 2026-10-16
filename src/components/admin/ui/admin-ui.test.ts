// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement as h, Fragment } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ConfirmProvider, useConfirm } from '@/components/admin/ui/ConfirmDialog'
import { StatusPill } from '@/components/admin/ui/AdminPrimitives'

afterEach(cleanup)

function Harness({ onResult }: { onResult: (ok: boolean) => void }) {
  const confirm = useConfirm()
  return h('button', { type: 'button', onClick: async () => onResult(await confirm({ title: 'Delete it?', confirmLabel: 'Delete', tone: 'danger' })) }, 'Trigger')
}

describe('ConfirmProvider', () => {
  it.each([
    ['Delete', true],
    ['Cancel', false],
  ] as const)('resolves %s as %s and closes', async (button, expected) => {
    const results: boolean[] = []
    render(h(ConfirmProvider, null, h(Harness, { onResult: (ok: boolean) => results.push(ok) })))
    fireEvent.click(screen.getByText('Trigger'))
    expect(await screen.findByRole('alertdialog')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByText(button)) })
    expect(results).toEqual([expected])
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('treats Escape as cancel', async () => {
    const results: boolean[] = []
    render(h(ConfirmProvider, null, h(Harness, { onResult: (ok: boolean) => results.push(ok) })))
    fireEvent.click(screen.getByText('Trigger'))
    await screen.findByRole('alertdialog')
    await act(async () => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(results).toEqual([false])
  })
})

describe('StatusPill', () => {
  it('maps synonyms to one vocabulary', () => {
    render(h(Fragment, null, h(StatusPill, { status: 'active' }), h(StatusPill, { status: 'inactive' }), h(StatusPill, { status: 'cancellation_requested' })))
    expect(screen.getByText('Live')).toBeTruthy()
    expect(screen.getByText('Hidden')).toBeTruthy()
    expect(screen.getByText('cancellation requested')).toBeTruthy()
  })
})
