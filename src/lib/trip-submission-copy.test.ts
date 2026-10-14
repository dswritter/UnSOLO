import { describe, expect, it } from 'vitest'
import { tripSubmissionCopy } from './trip-submission-copy'

describe('staff versus host trip submission copy', () => {
  it('uses direct creation and approval messaging for on-behalf staff creation', () => {
    const copy = tripSubmissionCopy({ isEdit: false, staffCreate: true })
    expect(copy.button).toBe('Create trip')
    expect(copy.working).toBe('Creating...')
    expect(copy.success).toContain('created and approved')
    expect(copy.success).toContain('verified account is linked')
    expect(copy.description).not.toContain('will be reviewed')
    expect(copy.success).not.toContain('will be reviewed')
  })
  it('keeps ordinary host submissions in the review flow', () => {
    const copy = tripSubmissionCopy({ isEdit: false, staffCreate: false })
    expect(copy.button).toBe('Submit for Review')
    expect(copy.working).toBe('Submitting...')
    expect(copy.description).toContain('will be reviewed by our team')
    expect(copy.success).toContain('reviewed by our team')
  })
  it.each([true, false])('saves edits instead of submitting again (staff=%s)', staffCreate => {
    const copy = tripSubmissionCopy({ isEdit: true, staffCreate })
    expect(copy.button).toBe('Save changes')
    expect(copy.description).not.toContain('will be reviewed')
  })
  it('does not create or publish while staff are editing a host draft', () => {
    const copy = tripSubmissionCopy({ isEdit: false, staffCreate: false, isStaffDraft: true })
    expect(copy.button).toBe('Save draft')
    expect(copy.description).toContain('does not create or publish')
  })
})