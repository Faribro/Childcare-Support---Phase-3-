/**
 * Controller Domain Types, Schemas, and State Definitions
 */

export type TaskStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'VERIFIED'
  | 'FAILED'
  | 'BLOCKED_APPROVAL'
  | 'BLOCKED_DEPENDENCY';

export type TaskActionType =
  | 'INSPECTION'
  | 'CODE_CHANGE'
  | 'TEST_EXECUTION'
  | 'TYPECHECK'
  | 'DOCUMENTATION';

export interface VerificationRule {
  readonly command: string;
  readonly expectedExitCode: number;
  readonly expectedEvidenceRegex?: string;
  readonly timeoutMs?: number;
}

export interface TaskDefinition {
  readonly id: string;
  readonly title: string;
  readonly actionType: TaskActionType;
  readonly assignedWorktree: string;
  readonly assignedBranch: string;
  readonly targetFiles: readonly string[];
  readonly dependencies: readonly string[];
  readonly requiresApproval: boolean;
  readonly verificationRules: readonly VerificationRule[];
  readonly promptContext: string;
}

export interface TaskExecutionEvidence {
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly exitCode: number;
  readonly changedFiles: readonly string[];
  readonly verificationOutputs: readonly {
    readonly command: string;
    readonly exitCode: number;
    readonly passed: boolean;
    readonly outputSnippet: string;
  }[];
  readonly plannerNotes?: string;
  readonly errorMessage?: string;
}

export interface TaskRecord {
  readonly task: TaskDefinition;
  status: TaskStatus;
  attempts: number;
  maxAttempts: number;
  evidence?: TaskExecutionEvidence;
  blockedReason?: string;
  lastUpdated: string;
}

export interface PlannerStructuredResponse {
  readonly taskId: string;
  readonly approvedToExecute: boolean;
  readonly strategyExplanation: string;
  readonly boundedInstructions: string;
  readonly filesToInspect: readonly string[];
  readonly filesToModify: readonly string[];
  readonly verificationCommands: readonly string[];
  readonly potentialRisks: readonly string[];
  readonly requiresHumanApproval: boolean;
  readonly rejectionReason?: string;
}

export interface ControllerBounds {
  readonly maxTasks: number; // e.g. 2 for pilot
  readonly maxMinutes: number; // e.g. 15 for pilot
  readonly maxRequests: number; // e.g. 4 for pilot
  readonly maxSpendUsd: number; // e.g. 1.00
  readonly stopFilePath: string;
  readonly stateFilePath: string;
}

export interface ControllerMetrics {
  tasksAttempted: number;
  tasksVerified: number;
  tasksFailed: number;
  tasksBlocked: number;
  requestsCount: number;
  totalTokensUsed: number;
  estimatedCostUsd: number;
  startedAt: string;
  lastCycleAt: string;
}

export interface ControllerState {
  readonly runId: string;
  readonly status: 'IDLE' | 'RUNNING' | 'COMPLETED' | 'STOPPED' | 'FAILED_CLOSED';
  readonly metrics: ControllerMetrics;
  readonly taskQueue: TaskRecord[];
  readonly activeTaskId?: string;
  readonly stopReason?: string;
}
