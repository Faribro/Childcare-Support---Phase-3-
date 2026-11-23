/**
 * Plain Language Dashboard Copy Constants
 * 
 * Provides clear, jargon-free messaging for field workers and supervisors.
 * Avoids technical/bureaucratic terms like "(local)", "Authorized scope", "Retryable", "DBT", and "passbook".
 * Single source of truth for dashboard wording.
 */

export const DASHBOARD_COPY = {
  sectionHeading: 'Needs Attention',
  sectionSubtitle: 'Pending work on this device and in your area.',

  badgeZero: 'Nothing needs your attention',
  badgeSingular: '1 thing needs your attention',
  badgePlural: (count: number) => `${count} things need your attention`,

  allClear: 'All clear',

  cards: {
    // Card 1: Forms to finish
    formsToFinish: {
      title: 'Forms to finish',
      description: 'Forms you started and saved.',
      linkText: 'Continue forms',
      allClearText: 'No incomplete drafts',
      href: '/assessment/drafts',
    },
    // Card 2: Waiting to send (standalone card per addendum)
    waitingToSend: {
      title: 'Waiting to send',
      description: 'Saved on this device. They send when you are online.',
      linkText: 'View outbox',
      allClearText: 'Everything has been sent',
      href: '/assessment/sync?tab=outbox',
    },
    // Card 3: Missing Docs (renamed from Pendings per user specification)
    pendings: {
      title: 'Missing Docs',
      description: 'Records that still need documents.',
      linkText: 'Review docs',
      allClearText: 'No missing documents',
      rows: {
        missingDocs: {
          label: 'Missing documents',
          hint: 'Records that still need an Aadhaar or photo.',
          href: '/assessment/sync?tab=docs',
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
    startSurveyTitle: 'Start New Survey',
    startSurveySubtitle: 'New beneficiary intake assessment',
    draftsTitle: 'Drafts',
    draftsSubtitle: 'Saved locally on this device',
    waitingToSendTitle: 'Waiting to send',
    waitingToSendSubtitle: 'Saved on this device, will send when online',
    pendingsTitle: 'Pendings',
    pendingsSubtitle: 'Missing documents & bank details needed',
    missingDocsTitle: 'Missing documents',
    missingDocsSubtitle: 'Records that still need an Aadhaar or photo',
    bankDetailsTitle: 'Bank details needed',
    bankDetailsSubtitle: 'Cases that still need bank details',
    submittedTitle: 'Submitted surveys',
    submittedSubtitle: 'Confirmed on central server',
    hideBreakdown: 'Hide breakdown',
    showBreakdown: 'Show breakdown',
  },
} as const;
