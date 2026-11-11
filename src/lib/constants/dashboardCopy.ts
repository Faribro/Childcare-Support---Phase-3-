/**
 * Plain Language Dashboard Copy Constants
 * 
 * Provides clear, jargon-free messaging for field workers and supervisors.
 * Avoids technical/bureaucratic terms like "(local)", "Authorized scope", "Retryable", "DBT", and "passbook".
 */

export const DASHBOARD_COPY = {
  sectionHeading: 'Needs Attention',
  sectionSubtitle: 'Pending work on this device and in your area.',
  
  badgeZero: 'Nothing needs your attention',
  badgePlural: (count: number) => `${count} things need your attention`,
  badgeSingular: '1 thing needs your attention',
  
  allClear: 'All clear',
  
  cards: {
    formsToFinish: {
      title: 'Forms to finish',
      description: 'Forms you started and saved.',
      linkText: 'Continue forms',
      allClearText: 'No incomplete drafts',
      href: '/assessment/drafts',
    },
    missingDocs: {
      title: 'Missing documents',
      description: 'Records that still need an Aadhaar or photo.',
      linkText: 'Add documents',
      allClearText: 'All documents uploaded',
      href: '/supervisor/assessments',
    },
    pendings: {
      title: 'Pendings',
      description: 'Things waiting to be sent or completed.',
      allClearText: 'No pending items',
      rows: {
        waitingToSend: {
          label: 'Waiting to send',
          hint: 'Saved on this device, will send when online',
          href: '/assessment/sync?tab=outbox',
        },
        bankDetailsNeeded: {
          label: 'Bank details needed',
          hint: 'Cases that still need bank details',
          href: '/assessment/sync?tab=bank_pending',
        },
      },
    },
  },
  
  mobile: {
    pendingsTitle: 'Pendings',
    pendingsSubtitle: 'Waiting to send or add bank details',
    draftsTitle: 'Drafts',
    draftsSubtitle: 'Saved locally on this device',
    submittedTitle: 'Submitted surveys',
    startSurveyTitle: 'Start New Survey',
    startSurveySubtitle: 'New beneficiary intake assessment',
  },
} as const;
