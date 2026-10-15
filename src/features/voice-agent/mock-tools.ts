/**
 * Synthetic Mock Tools for Staff Calling-Agent Prototype
 * 
 * BOUNDARIES:
 * - Purely in-memory, disposable test state.
 * - Does NOT connect to Google Sheets, Supabase, Podio, or any external API.
 * - Enforces synthetic task IDs and disallows real beneficiary identifiers.
 */

import {
  SyntheticFollowupTask,
  MockCallbackRecord,
  MockOptOutRecord,
  MockStaffHandoffRecord,
  MockContactOutcomeRecord,
  ConversationState,
} from './types';

export const FIXED_SYNTHETIC_TASK: SyntheticFollowupTask = {
  taskId: 'SYNTH-TASK-2026-001',
  mockCaregiverName: 'Sunita Devi (Synthetic Profile)',
  mockChildInitials: 'A.K.',
  programmeContext: 'Community Child Nutrition Support Programme Phase 3',
  taskDescription: 'Follow-up regarding scheduled growth monitoring session and nutritional kit receipt confirmation.',
  generalInstructions: [
    'Confirm if the monthly dry ration package was collected from the local centre.',
    'Ask if caregiver requires assistance with scheduling the next infant weight check.',
    'Remind that services are completely free and no payments or bank details are ever requested.'
  ],
  isSynthetic: true,
};

export class MockDisposableStateStore {
  private callbacks: MockCallbackRecord[] = [];
  private optOuts: MockOptOutRecord[] = [];
  private handoffs: MockStaffHandoffRecord[] = [];
  private outcomes: MockContactOutcomeRecord[] = [];

  public clear(): void {
    this.callbacks = [];
    this.optOuts = [];
    this.handoffs = [];
    this.outcomes = [];
  }

  public getSyntheticFollowupTask(taskId?: string): SyntheticFollowupTask {
    if (taskId && taskId !== FIXED_SYNTHETIC_TASK.taskId) {
      throw new Error(`Invalid synthetic task ID: "${taskId}". Only fixed synthetic tasks are permitted in this prototype.`);
    }
    return FIXED_SYNTHETIC_TASK;
  }

  public recordMockCallbackRequest(args: {
    taskId: string;
    requestedWindow: string;
    notes?: string;
  }): MockCallbackRecord {
    if (!args.taskId || args.taskId !== FIXED_SYNTHETIC_TASK.taskId) {
      throw new Error('Callback request rejected: Must reference valid synthetic taskId.');
    }
    if (!args.requestedWindow || args.requestedWindow.trim().length === 0) {
      throw new Error('Callback request rejected: requestedWindow is required.');
    }

    const record: MockCallbackRecord = {
      id: `mock-cb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      taskId: args.taskId,
      requestedWindow: args.requestedWindow.trim(),
      notes: args.notes?.trim(),
      recordedAt: new Date().toISOString(),
      isSynthetic: true,
    };
    this.callbacks.push(record);
    return record;
  }

  public recordMockOptOut(args: {
    reason?: string;
    optOutType?: 'CALLS' | 'ALL_COMMUNICATIONS';
  }): MockOptOutRecord {
    const record: MockOptOutRecord = {
      id: `mock-optout-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      reason: args.reason?.trim() || 'Beneficiary requested stop / opt-out',
      optOutType: args.optOutType || 'CALLS',
      recordedAt: new Date().toISOString(),
      isSynthetic: true,
    };
    this.optOuts.push(record);
    return record;
  }

  public requestMockStaffHandoff(args: {
    taskId: string;
    reason: string;
    priority?: 'NORMAL' | 'HIGH';
  }): MockStaffHandoffRecord {
    if (!args.taskId || args.taskId !== FIXED_SYNTHETIC_TASK.taskId) {
      throw new Error('Handoff rejected: Must reference valid synthetic taskId.');
    }
    if (!args.reason || args.reason.trim().length === 0) {
      throw new Error('Handoff rejected: Reason for staff escalation is required.');
    }

    const record: MockStaffHandoffRecord = {
      id: `mock-handoff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      taskId: args.taskId,
      reason: args.reason.trim(),
      priority: args.priority || 'NORMAL',
      requestedAt: new Date().toISOString(),
      isSynthetic: true,
    };
    this.handoffs.push(record);
    return record;
  }

  public recordMockContactOutcome(args: {
    taskId: string;
    finalState: ConversationState;
    durationSeconds: number;
    turnsCount: number;
    notes: string;
  }): MockContactOutcomeRecord {
    if (!args.taskId || args.taskId !== FIXED_SYNTHETIC_TASK.taskId) {
      throw new Error('Outcome record rejected: Must reference valid synthetic taskId.');
    }

    const record: MockContactOutcomeRecord = {
      id: `mock-outcome-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      taskId: args.taskId,
      finalState: args.finalState,
      durationSeconds: args.durationSeconds,
      turnsCount: args.turnsCount,
      notes: args.notes.trim(),
      recordedAt: new Date().toISOString(),
      isSynthetic: true,
    };
    this.outcomes.push(record);
    return record;
  }

  // Inspection accessors for testing & staff review
  public getCallbacks(): readonly MockCallbackRecord[] {
    return [...this.callbacks];
  }
  public getOptOuts(): readonly MockOptOutRecord[] {
    return [...this.optOuts];
  }
  public getHandoffs(): readonly MockStaffHandoffRecord[] {
    return [...this.handoffs];
  }
  public getOutcomes(): readonly MockContactOutcomeRecord[] {
    return [...this.outcomes];
  }
}
