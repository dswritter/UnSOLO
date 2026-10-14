/** Staff creation is approval; normal host creation still enters moderation.
 * Saving somebody else's draft is neither creation nor publication. */
export function tripSubmissionCopy({ isEdit, staffCreate, isStaffDraft = false }: {
  isEdit: boolean
  staffCreate: boolean
  isStaffDraft?: boolean
}) {
  if (isStaffDraft) return {
    button: 'Save draft', working: 'Saving…',
    description: 'Double-check the host’s draft before saving. Saving a draft does not create or publish a listing.',
    success: 'Saved to the host’s draft.',
  }
  if (isEdit) return {
    button: 'Save changes', working: 'Saving...',
    description: 'Double-check everything before saving your changes.', success: 'Trip updated.',
  }
  if (staffCreate) return {
    button: 'Create trip', working: 'Creating...',
    description: 'Double-check everything before creating the trip. No additional review is needed. It goes live once the host’s verified account is linked.',
    success: 'Trip created and approved. It goes live once the host’s verified account is linked.',
  }
  return {
    button: 'Submit for Review', working: 'Submitting...',
    description: 'Double-check everything before submitting. Your trip will be reviewed by our team.',
    success: 'Trip created! It will be reviewed by our team before going live.',
  }
}