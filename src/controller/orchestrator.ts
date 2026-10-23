/**
 * Bounded Overnight Controller Orchestrator
 *
 * Implements the robust, crash-resilient control loop coordinating:
 * 1. Sanitized task queue selection & dependency resolution
 * 2. Worktree concurrency mutex locking
 * 3. Bounded Perplexity planning & validation
 * 4. Antigravity worker execution & evidence collection
 * 5. Atomic state checkpointing and STOP file handling
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  ControllerConfig,
} from './config';
import type {
  ControllerState,
  ControllerMetrics,
  TaskRecord,
  TaskDefinition,
} from './types';
import { WorktreeLockManager } from './worktreeLock';
import { type IPlannerClient, AntigravityNativePlanner, PerplexityApiClient } from './perplexityPlanner';
import type { IAntigravityExecutor } from './antigravityExecutor';

export class BoundedOvernightController {
  private readonly config: ControllerConfig;
  private readonly planner: IPlannerClient;
  private readonly executor: IAntigravityExecutor;
  private readonly lockManager: WorktreeLockManager;
  private state: ControllerState;
  private readonly projectBrief: string;

  constructor(params: {
    config: ControllerConfig;
    planner?: IPlannerClient;
    executor: IAntigravityExecutor;
    lockManager?: WorktreeLockManager;
    initialTasks?: TaskDefinition[];
    projectBrief?: string;
  }) {
    this.config = params.config;
    this.executor = params.executor;
    this.lockManager = params.lockManager || new WorktreeLockManager();
    this.projectBrief = params.projectBrief || 'Paediatric nutrition intake & linelist management platform';

    this.state = this.loadOrInitializeState(params.initialTasks || []);
    this.reconcileCrashedState();

    if (params.planner) {
      this.planner = params.planner;
    } else if (this.config.plannerMode === 'PERPLEXITY' && this.config.perplexityApiKey) {
      this.planner = new PerplexityApiClient(this.config, this.state.metrics);
    } else {
      this.planner = new AntigravityNativePlanner();
    }
  }

  private loadOrInitializeState(initialTasks: TaskDefinition[]): ControllerState {
    const filePath = this.config.bounds.stateFilePath;
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.runId && Array.isArray(parsed.taskQueue)) {
          return parsed as ControllerState;
        }
      } catch {}
    }

    const taskQueue: TaskRecord[] = initialTasks.map((t) => ({
      task: t,
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 3,
      lastUpdated: new Date().toISOString(),
    }));

    return {
      runId: `run-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      status: 'IDLE',
      metrics: {
        tasksAttempted: 0,
        tasksVerified: 0,
        tasksFailed: 0,
        tasksBlocked: 0,
        requestsCount: 0,
        totalTokensUsed: 0,
        estimatedCostUsd: 0,
        startedAt: new Date().toISOString(),
        lastCycleAt: new Date().toISOString(),
      },
      taskQueue,
    };
  }

  private saveStateAtomically(): void {
    const filePath = this.config.bounds.stateFilePath;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf-8');
    fs.renameSync(tmp, filePath);
  }

  /**
   * Recovers from an unexpected previous process crash.
   * If a task was left in 'RUNNING' status, reconciles without blindly repeating.
   */
  private reconcileCrashedState(): void {
    const running = this.state.taskQueue.find((t) => t.status === 'RUNNING');
    if (running) {
      if (running.attempts >= running.maxAttempts) {
        running.status = 'FAILED';
        running.blockedReason = 'CRASH_RECOVERY: Exceeded maximum attempts after process termination.';
      } else {
        running.status = 'PENDING';
        running.blockedReason = 'CRASH_RECOVERY: Requeued task after incomplete execution run.';
      }
      running.lastUpdated = new Date().toISOString();
      this.saveStateAtomically();
    }
  }

  public getState(): ControllerState {
    return this.state;
  }

  public isStopRequested(): boolean {
    return fs.existsSync(this.config.bounds.stopFilePath);
  }

  /**
   * Evaluates if any configured boundary condition has been reached.
   */
  public evaluateBoundaryCeilings(runStartTime: number): { stop: boolean; reason?: string } {
    if (this.isStopRequested()) {
      return { stop: true, reason: `STOP_FILE_DETECTED: Stop requested via ${this.config.bounds.stopFilePath}` };
    }

    if (this.state.metrics.tasksAttempted >= this.config.bounds.maxTasks) {
      return { stop: true, reason: `BOUND_REACHED: Completed maxTasks ceiling (${this.config.bounds.maxTasks})` };
    }

    const elapsedMinutes = (Date.now() - runStartTime) / (1000 * 60);
    if (elapsedMinutes >= this.config.bounds.maxMinutes) {
      return { stop: true, reason: `BOUND_REACHED: Elapsed time (${elapsedMinutes.toFixed(1)}m) exceeded maxMinutes (${this.config.bounds.maxMinutes}m)` };
    }

    if (this.state.metrics.requestsCount >= this.config.bounds.maxRequests) {
      return { stop: true, reason: `BOUND_REACHED: Max Perplexity requests (${this.config.bounds.maxRequests}) reached` };
    }

    if (this.state.metrics.estimatedCostUsd >= this.config.bounds.maxSpendUsd) {
      return { stop: true, reason: `BOUND_REACHED: Max spend ceiling ($${this.config.bounds.maxSpendUsd.toFixed(2)}) reached` };
    }

    return { stop: false };
  }

  /**
   * Selects the next eligible unblocked task.
   */
  public selectNextTask(): TaskRecord | null {
    for (const record of this.state.taskQueue) {
      if (record.status !== 'PENDING') continue;

      // 1. Dependency checks
      if (record.task.dependencies && record.task.dependencies.length > 0) {
        const hasUnmetDep = record.task.dependencies.some((depId) => {
          const depRecord = this.state.taskQueue.find((r) => r.task.id === depId);
          return !depRecord || depRecord.status !== 'VERIFIED';
        });

        if (hasUnmetDep) {
          record.status = 'BLOCKED_DEPENDENCY';
          record.blockedReason = `Unmet dependencies: ${record.task.dependencies.join(', ')}`;
          record.lastUpdated = new Date().toISOString();
          this.saveStateAtomically();
          continue;
        }
      }

      // 2. Explicit approval check
      if (record.task.requiresApproval) {
        record.status = 'BLOCKED_APPROVAL';
        record.blockedReason = `Task requires explicit maintainer approval before local execution.`;
        record.lastUpdated = new Date().toISOString();
        this.saveStateAtomically();
        continue;
      }

      return record;
    }
    return null;
  }

  /**
   * Executes a single control cycle.
   */
  public async executeCycle(runStartTime: number): Promise<{ executed: boolean; taskId?: string; reason?: string }> {
    const boundary = this.evaluateBoundaryCeilings(runStartTime);
    if (boundary.stop) {
      this.state = {
        ...this.state,
        status: 'STOPPED',
        stopReason: boundary.reason,
      };
      this.saveStateAtomically();
      return { executed: false, reason: boundary.reason };
    }

    const taskRecord = this.selectNextTask();
    if (!taskRecord) {
      this.state = {
        ...this.state,
        status: 'COMPLETED',
        stopReason: 'No remaining unblocked tasks in queue.',
      };
      this.saveStateAtomically();
      return { executed: false, reason: 'QUEUE_EMPTY' };
    }

    const task = taskRecord.task;
    taskRecord.status = 'RUNNING';
    taskRecord.attempts += 1;
    taskRecord.lastUpdated = new Date().toISOString();
    this.state = {
      ...this.state,
      activeTaskId: task.id,
      status: 'RUNNING',
    };
    this.saveStateAtomically();

    // 1. Acquire Worktree Lock
    const lockResult = await this.lockManager.acquireLock({
      worktreePath: task.assignedWorktree,
      workerId: `controller-${this.state.runId}`,
      expectedBranch: task.assignedBranch,
      requireCleanState: false, // allow within controlled workspace
    });

    if (!lockResult.acquired) {
      taskRecord.status = 'PENDING';
      taskRecord.blockedReason = lockResult.error;
      taskRecord.lastUpdated = new Date().toISOString();
      this.saveStateAtomically();
      return { executed: false, taskId: task.id, reason: lockResult.error };
    }

    try {
      // 2. Optional Bounded Planning
      let plannerOutput: any;
      try {
        plannerOutput = await this.planner.planTask(task, this.projectBrief);
      } catch (err: any) {
        if (err.message && err.message.includes('CREDENTIALS_MISSING')) {
          // Graceful fallback to Antigravity Native Planner when external key is missing
          const nativePlanner = new AntigravityNativePlanner();
          plannerOutput = await nativePlanner.planTask(task, this.projectBrief);
        } else {
          // Unrecoverable planner failure fails closed on this task
          taskRecord.status = 'FAILED';
          taskRecord.blockedReason = `Planner error: ${err.message}`;
          taskRecord.lastUpdated = new Date().toISOString();
          this.state.metrics.tasksFailed += 1;
          this.state.metrics.tasksAttempted += 1;
          this.saveStateAtomically();
          return { executed: true, taskId: task.id, reason: `PLANNER_FAILED: ${err.message}` };
        }
      }

      // Check if planner determined human approval is required
      if (plannerOutput && plannerOutput.requiresHumanApproval) {
        taskRecord.status = 'BLOCKED_APPROVAL';
        taskRecord.blockedReason = `Planner flagged potential risk: ${plannerOutput.rejectionReason || 'Requires manual sign-off'}`;
        taskRecord.lastUpdated = new Date().toISOString();
        this.state.metrics.tasksBlocked += 1;
        this.saveStateAtomically();
        return { executed: true, taskId: task.id, reason: 'PLANNER_FLAGGED_APPROVAL' };
      }

      // 3. Antigravity Executor Invocation
      const executionResult = await this.executor.executeTask(task, plannerOutput);

      // 4. Verification Check
      if (executionResult.success && executionResult.exitCode === 0) {
        taskRecord.status = 'VERIFIED';
        this.state.metrics.tasksVerified += 1;
      } else {
        taskRecord.status = 'FAILED';
        this.state.metrics.tasksFailed += 1;
      }

      taskRecord.evidence = {
        startedAt: taskRecord.lastUpdated,
        completedAt: new Date().toISOString(),
        durationMs: executionResult.durationMs,
        exitCode: executionResult.exitCode,
        changedFiles: executionResult.changedFiles,
        verificationOutputs: executionResult.verificationOutputs,
        plannerNotes: plannerOutput?.strategyExplanation,
        errorMessage: executionResult.errorMessage,
      };

      this.state.metrics.tasksAttempted += 1;
      this.state.metrics.lastCycleAt = new Date().toISOString();
      taskRecord.lastUpdated = this.state.metrics.lastCycleAt;
      this.saveStateAtomically();

      return { executed: true, taskId: task.id };
    } finally {
      // Release Worktree Lock
      await this.lockManager.releaseLock(task.assignedWorktree, `controller-${this.state.runId}`);
    }
  }

  /**
   * Runs the bounded control loop up to the configured limits.
   */
  public async runLoop(): Promise<ControllerState> {
    const runStartTime = Date.now();
    this.state = {
      ...this.state,
      status: 'RUNNING',
    };
    this.saveStateAtomically();

    while (true) {
      const result = await this.executeCycle(runStartTime);
      if (!result.executed) {
        break;
      }
    }

    return this.state;
  }
}
