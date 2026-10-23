/**
 * WhatsApp Document & Follow-Up Reminder Scheduler
 *
 * Implements:
 * 1. Authoritative record state evaluation for missing documents and scheduled follow-ups.
 * 2. Strict Caregiver Subscription & Consent Gating (must be SUBSCRIBED with appropriate category).
 * 3. Quiet Hours Suppression (Indian Standard Time, UTC+5:30: 08:00 to 20:00 allowed; 20:00 to 08:00 suppressed).
 * 4. Cadence & Frequency Limits (minimum 24h interval, maximum 2 reminders per milestone).
 * 5. Privacy-Preserving Neutral Text (NO HIV, VL values, Aadhaar, bank numbers, or child IDs in proactive notifications).
 * 6. Immediate Auto-Cancellation upon document upload or task completion.
 * 7. Opt-Out & Pause Enforcement (immediate cancellation if caregiver pauses or opts out).
 */

import crypto from 'crypto';
import { DocType, SubmissionEntity } from './types';
import {
  CaregiverLanguage,
  CaregiverSubscriptionRecord,
  MessagingConsentCategory,
} from '../caregiver-subscription/types';
import { MissingDocumentDetector } from './missing-document-detector';

export type ReminderStatus =
  | 'SCHEDULED'
  | 'DISPATCHED'
  | 'CANCELLED_DOCUMENT_RECEIVED'
  | 'CANCELLED_OPT_OUT'
  | 'CANCELLED_PAUSED'
  | 'MAX_REACHED'
  | 'SUPPRESSED_QUIET_HOURS';

export interface DocumentReminderRecord {
  readonly reminderId: string;
  readonly submissionId: string;
  readonly docType?: DocType;
  readonly category: MessagingConsentCategory;
  remindersSentCount: number;
  readonly maxRemindersAllowed: number;
  lastSentAt?: string;
  nextAllowedAt?: string;
  status: ReminderStatus;
  cancelledAt?: string;
  cancelReason?: string;
}

export interface ReminderEvaluationResult {
  readonly eligible: boolean;
  readonly reason?: string;
  readonly reminderRecord?: DocumentReminderRecord;
  readonly outboundPayload?: {
    readonly recipientPhoneMasked: string;
    readonly messageText: string;
    readonly templateName: string;
    readonly language: CaregiverLanguage;
    readonly isProactive: true;
  };
}

export const REMINDER_CONFIG = {
  MAX_REMINDERS_PER_MILESTONE: 2,
  COOLDOWN_HOURS: 24,
  QUIET_HOURS_START_IST: 20, // 8:00 PM IST
  QUIET_HOURS_END_IST: 8, // 8:00 AM IST
} as const;

export class DocumentReminderScheduler {
  private readonly detector: MissingDocumentDetector;
  private readonly reminders = new Map<string, DocumentReminderRecord>();

  constructor(detector: MissingDocumentDetector = new MissingDocumentDetector()) {
    this.detector = detector;
  }

  /**
   * Evaluates whether the current moment falls within Indian Standard Time quiet hours (8 PM - 8 AM IST).
   * IST is UTC + 5 hours 30 minutes.
   */
  public isQuietHours(date: Date = new Date()): { isQuietHours: boolean; istHour: number } {
    // Calculate IST time
    const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(utcTime + istOffsetMs);
    const istHour = istDate.getHours();

    const isQuiet =
      istHour >= REMINDER_CONFIG.QUIET_HOURS_START_IST ||
      istHour < REMINDER_CONFIG.QUIET_HOURS_END_IST;

    return { isQuietHours: isQuiet, istHour };
  }

  /**
   * Evaluates a submission against a caregiver's subscription for due reminders.
   * Enforces consent, opt-out, cadence, and quiet hours.
   */
  public evaluateReminder(
    submission: SubmissionEntity,
    subscription: CaregiverSubscriptionRecord | null,
    now: Date = new Date()
  ): ReminderEvaluationResult {
    // 1. Subscription & State Check
    if (!subscription) {
      return { eligible: false, reason: 'NO_CAREGIVER_SUBSCRIPTION' };
    }

    if (subscription.state === 'OPTED_OUT') {
      return { eligible: false, reason: 'CAREGIVER_OPTED_OUT' };
    }

    if (subscription.state === 'PAUSED') {
      return { eligible: false, reason: 'CAREGIVER_SUBSCRIPTION_PAUSED' };
    }

    if (subscription.state !== 'SUBSCRIBED' || !subscription.consentProvided) {
      return { eligible: false, reason: 'AFFIRMATIVE_CONSENT_NOT_GRANTED' };
    }

    // 2. Consent Category Check (DOCUMENTS category must be approved)
    if (!subscription.consentCategories.includes('DOCUMENTS')) {
      return { eligible: false, reason: 'DOCUMENT_CATEGORY_CONSENT_MISSING' };
    }

    // 3. Authoritative Record Check: Are any required documents actually missing?
    const missingDocs = this.detector.detectMissingDocuments(submission);
    if (missingDocs.length === 0) {
      // If none missing, ensure any existing scheduled reminder is cancelled
      this.cancelRemindersForSubmission(submission.id, 'ALL_DOCUMENTS_PRESENT');
      return { eligible: false, reason: 'NO_DOCUMENTS_MISSING' };
    }

    // 4. Quiet Hours Check
    const { isQuietHours, istHour } = this.isQuietHours(now);
    if (isQuietHours) {
      return {
        eligible: false,
        reason: `QUIET_HOURS_ACTIVE_IST_${istHour}`,
      };
    }

    // 5. Existing Reminder History & Cadence Check
    const reminderKey = `rem_${submission.id}_docs`;
    let reminder = this.reminders.get(reminderKey);

    if (!reminder) {
      reminder = {
        reminderId: `rem_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        submissionId: submission.id,
        category: 'DOCUMENTS',
        remindersSentCount: 0,
        maxRemindersAllowed: REMINDER_CONFIG.MAX_REMINDERS_PER_MILESTONE,
        status: 'SCHEDULED',
      };
      this.reminders.set(reminderKey, reminder);
    }

    // Check maximum frequency limit (max 2 reminders per milestone)
    if (reminder.remindersSentCount >= reminder.maxRemindersAllowed) {
      reminder.status = 'MAX_REACHED';
      return { eligible: false, reason: 'MAX_REMINDER_COUNT_REACHED' };
    }

    // Check 24-hour cadence cooldown
    if (reminder.lastSentAt) {
      const lastSentMs = new Date(reminder.lastSentAt).getTime();
      const elapsedHours = (now.getTime() - lastSentMs) / (1000 * 60 * 60);
      if (elapsedHours < REMINDER_CONFIG.COOLDOWN_HOURS) {
        return {
          eligible: false,
          reason: `CADENCE_COOLDOWN_ACTIVE_${Math.round(REMINDER_CONFIG.COOLDOWN_HOURS - elapsedHours)}H_REMAINING`,
        };
      }
    }

    // 6. Build Neutral Privacy-Preserving Notification Text
    // NEVER includes clinical diagnoses, HIV status, viral load counts, Aadhaar, bank details, or child IDs.
    const messageText = this.buildNeutralReminderText(subscription.preferredLanguage);

    return {
      eligible: true,
      reminderRecord: reminder,
      outboundPayload: {
        recipientPhoneMasked: subscription.phoneMasked,
        messageText,
        templateName: 'childcare_doc_reminder_neutral',
        language: subscription.preferredLanguage,
        isProactive: true,
      },
    };
  }

  /**
   * Marks a reminder as dispatched, updates timestamp and increments counter.
   */
  public recordDispatch(reminderId: string, dispatchedAt: string = new Date().toISOString()): void {
    for (const reminder of this.reminders.values()) {
      if (reminder.reminderId === reminderId) {
        reminder.remindersSentCount += 1;
        reminder.lastSentAt = dispatchedAt;
        reminder.status =
          reminder.remindersSentCount >= reminder.maxRemindersAllowed
            ? 'MAX_REACHED'
            : 'DISPATCHED';
        break;
      }
    }
  }

  /**
   * Auto-cancellation: Triggered when an incoming document upload is received and stored.
   * Cancels pending reminders for that submission immediately.
   */
  public cancelRemindersForSubmission(submissionId: string, reason: string): void {
    const reminderKey = `rem_${submissionId}_docs`;
    const reminder = this.reminders.get(reminderKey);
    if (reminder && reminder.status !== 'CANCELLED_DOCUMENT_RECEIVED') {
      reminder.status = 'CANCELLED_DOCUMENT_RECEIVED';
      reminder.cancelledAt = new Date().toISOString();
      reminder.cancelReason = reason;
    }
  }

  /**
   * Retrieves active reminder record for testing or inspection.
   */
  public getReminder(submissionId: string): DocumentReminderRecord | undefined {
    return this.reminders.get(`rem_${submissionId}_docs`);
  }

  /**
   * Neutral Privacy-Preserving Reminder Text
   * Complies with Indian DPDP Act and Section 4 instructions.
   */
  public buildNeutralReminderText(lang: CaregiverLanguage): string {
    const texts: Record<CaregiverLanguage, string> = {
      mr: `नमस्ते. अलायन्स बाल संगोपन सहाय्य कार्यक्रमातून हा संदेश आहे. आपल्या अर्जासाठी आवश्यक कागदपत्रांची पूर्तता अद्याप प्रलंबित आहे. कृपया आवश्यक कागदपत्रांचा स्पष्ट फोटो या व्हॉट्सॲपवर पाठवा. थांबवण्यासाठी 'STOP' पाठवा.`,
      hi: `नमस्ते। एलायंस बाल पोषण सहायता कार्यक्रम से यह संदेश है। आपके आवेदन के लिए आवश्यक दस्तावेज़ अभी भी लंबित हैं। कृपया दस्तावेज़ का स्पष्ट फोटो यहाँ भेजें। रोकने के लिए 'STOP' लिखें।`,
      en: `Hello. This is a reminder from the Alliance Child Nutrition Programme. Required documentation for your application remains pending. Please reply with a clear photo of the document. Reply 'STOP' to unsubscribe.`,
      gu: `નમસ્તે. એલાયન્સ ચાઇલ્ડ ન્યુટ્રિશન પ્રોગ્રામ તરફથી સંદેશ. તમારી અરજી માટે જરૂરી દસ્તાવેજ હજી બાકી છે. કૃપા કરીને દસ્તાવેજનો સ્પષ્ટ ફોટો અહીં મોકલો. રોકવા 'STOP' મોકલો.`,
      bn: `নমস্কার। অ্যালায়েন্স চাইল্ড নিউট্রিশন প্রোগ্রাম থেকে বার্তা। আপনার আবেদনের জন্য প্রয়োজনীয় নথি এখনও বকেয়া রয়েছে। দয়া করে নথির একটি পরিষ্কার ছবি এখানে পাঠান। বন্ধ করতে 'STOP' লিখুন।`,
    };

    return texts[lang] || texts.mr;
  }
}
