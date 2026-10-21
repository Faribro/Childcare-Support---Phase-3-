/**
 * Harmless Real Pilot Runner for Bounded Overnight Controller
 *
 * Sequence:
 * 1. Load config & safety bounds
 * 2. Plan task (using Perplexity API if configured, else mock)
 * 3. Invoke real Antigravity executor (read-only inspection & baseline tests)
 * 4. Collect process exit status, outputs, and diffs
 * 5. Update state file atomically
 * 6. Select next allowed task up to pilot bounds (max 2 tasks, 15 min)
 */

import path from 'path';
import fs from 'fs';
import { loadControllerConfig } from '../src/controller/config';
import { BoundedOvernightController } from '../src/controller/orchestrator';
import { PerplexityApiClient, AntigravityNativePlanner } from '../src/controller/perplexityPlanner';
import { AntigravityExecutor } from '../src/controller/antigravityExecutor';
import { WorktreeLockManager } from '../src/controller/worktreeLock';
import type { TaskDefinition } from '../src/controller/types';

async function main() {
  console.log('================================================================');
  console.log('🚀 BOUNDED OVERNIGHT CONTROLLER: REAL PILOT EXECUTION');
  console.log('================================================================');

  const config = loadControllerConfig();
  console.log(`[Config] Secrets File Path : ${config.secretsFilePath}`);
  console.log(`[Config] Planner Mode      : ${config.plannerMode}`);
  console.log(`[Config] Perplexity Key    : ${config.perplexityApiKey ? 'CONFIGURED (Redacted)' : 'NOT CONFIGURED (Antigravity-Only Mode)'}`);
  console.log(`[Config] Max Tasks Allowed : ${config.bounds.maxTasks}`);
  console.log(`[Config] Max Minutes       : ${config.bounds.maxMinutes}`);
  console.log(`[Config] State File Path   : ${config.bounds.stateFilePath}`);
  console.log(`[Config] Stop File Path    : ${config.bounds.stopFilePath}`);

  const lockManager = new WorktreeLockManager();
  const executor = new AntigravityExecutor(config);

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

  const planner = (config.plannerMode === 'PERPLEXITY' && config.perplexityApiKey)
    ? new PerplexityApiClient(config, metrics)
    : new AntigravityNativePlanner();

  const pilotTasks: TaskDefinition[] = [
    {
      id: 'PILOT-001',
      title: 'Preflight worktree inspection',
      actionType: 'INSPECTION',
      assignedWorktree: process.cwd(),
      assignedBranch: 'feat/staging-destination-hardening',
      targetFiles: ['package.json'],
      dependencies: [],
      requiresApproval: false,
      verificationRules: [
        {
          command: 'git status',
          expectedExitCode: 0,
        },
      ],
      promptContext: 'Verify that the local worktree git repository is intact and accessible.',
    },
    {
      id: 'PILOT-002',
      title: 'Execute baseline test suite',
      actionType: 'TEST_EXECUTION',
      assignedWorktree: process.cwd(),
      assignedBranch: 'feat/staging-destination-hardening',
      targetFiles: ['src/test/baseline.test.ts'],
      dependencies: ['PILOT-001'],
      requiresApproval: false,
      verificationRules: [
        {
          command: 'npx vitest run src/test/baseline.test.ts',
          expectedExitCode: 0,
          expectedEvidenceRegex: 'passed',
        },
      ],
      promptContext: 'Execute baseline vitest suite to confirm local testing harness integrity.',
    },
  ];

  const controller = new BoundedOvernightController({
    config,
    planner,
    executor,
    lockManager,
    initialTasks: pilotTasks,
    projectBrief: 'Childcare Support PWA Phase 3 - Staging Hardening & Integration Controller',
  });

  console.log('\n[Controller] Starting Bounded Pilot Run...');
  const finalState = await controller.runLoop();

  console.log('\n================================================================');
  console.log('🏁 PILOT RUN COMPLETE');
  console.log('================================================================');
  console.log(`Status            : ${finalState.status}`);
  console.log(`Tasks Attempted   : ${finalState.metrics.tasksAttempted}`);
  console.log(`Tasks Verified    : ${finalState.metrics.tasksVerified}`);
  console.log(`Tasks Failed      : ${finalState.metrics.tasksFailed}`);
  console.log(`Tasks Blocked     : ${finalState.metrics.tasksBlocked}`);
  console.log(`Stop Reason       : ${finalState.stopReason || 'None'}`);
  console.log(`State Saved To    : ${config.bounds.stateFilePath}`);

  for (const t of finalState.taskQueue) {
    console.log(`\n- [${t.status}] ${t.task.id}: ${t.task.title}`);
    if (t.evidence) {
      console.log(`  Duration : ${t.evidence.durationMs}ms`);
      console.log(`  Exit Code: ${t.evidence.exitCode}`);
      for (const vo of t.evidence.verificationOutputs) {
        console.log(`  Rule     : "${vo.command}" -> ${vo.passed ? 'PASSED' : 'FAILED'} (exit ${vo.exitCode})`);
      }
    }
    if (t.blockedReason) {
      console.log(`  Reason   : ${t.blockedReason}`);
    }
  }

  // Ensure state file exists
  if (fs.existsSync(config.bounds.stateFilePath)) {
    console.log('\n[Verified Evidence] Atomic state file confirmed on disk.');
  }
}

main().catch((err) => {
  console.error('[Pilot Error]', err);
  process.exit(1);
});
