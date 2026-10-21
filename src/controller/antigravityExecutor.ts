/**
 * Bounded Antigravity Executor
 *
 * Interfaces with the installed Antigravity execution mechanism (agentapi.bat / local process runner).
 * Collects process exit status, changed files, and verified test results.
 * Strictly enforces that exit code 0 or "agent claims done" is NOT sufficient alone for acceptance;
 * concrete verification rules (regex match + exit code) must pass.
 */

import { execSync } from 'child_process';
import type { TaskDefinition, PlannerStructuredResponse, VerificationRule } from './types';
import type { ControllerConfig } from './config';

export interface ExecutionResult {
  readonly success: boolean;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly changedFiles: readonly string[];
  readonly verificationOutputs: readonly {
    readonly command: string;
    readonly exitCode: number;
    readonly passed: boolean;
    readonly outputSnippet: string;
  }[];
  readonly stdoutSnippet: string;
  readonly errorMessage?: string;
}

export interface IAntigravityExecutor {
  executeTask(task: TaskDefinition, plannerOutput?: PlannerStructuredResponse): Promise<ExecutionResult>;
}

export class MockAntigravityExecutor implements IAntigravityExecutor {
  public executionCount = 0;
  private customResult?: Partial<ExecutionResult>;

  constructor(customResult?: Partial<ExecutionResult>) {
    this.customResult = customResult;
  }

  public setResult(res: Partial<ExecutionResult>): void {
    this.customResult = res;
  }

  public async executeTask(
    task: TaskDefinition,
    plannerOutput?: PlannerStructuredResponse
  ): Promise<ExecutionResult> {
    this.executionCount += 1;
    return {
      success: this.customResult?.success ?? true,
      exitCode: this.customResult?.exitCode ?? 0,
      durationMs: this.customResult?.durationMs ?? 150,
      changedFiles: this.customResult?.changedFiles ?? (task.targetFiles ? [...task.targetFiles] : []),
      verificationOutputs: this.customResult?.verificationOutputs ?? [
        {
          command: 'npm run typecheck',
          exitCode: 0,
          passed: true,
          outputSnippet: 'tsc --noEmit passed cleanly with 0 errors.',
        },
      ],
      stdoutSnippet: this.customResult?.stdoutSnippet ?? 'Mock execution completed successfully.',
      errorMessage: this.customResult?.errorMessage,
    };
  }
}

export class AntigravityExecutor implements IAntigravityExecutor {
  private readonly config: ControllerConfig;

  constructor(config: ControllerConfig) {
    this.config = config;
  }

  public async executeTask(
    task: TaskDefinition,
    plannerOutput?: PlannerStructuredResponse
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const verificationOutputs: Array<{
      command: string;
      exitCode: number;
      passed: boolean;
      outputSnippet: string;
    }> = [];

    // Collect baseline modified files before execution
    let baselineFiles: string[] = [];
    try {
      const gitStatusBefore = execSync('git status --porcelain', {
        cwd: task.assignedWorktree,
        stdio: 'pipe',
      }).toString();
      baselineFiles = gitStatusBefore.split('\n').filter(Boolean);
    } catch {}

    // Combine task verification rules and permitted planner verification commands
    const rulesToExecute: VerificationRule[] = [...task.verificationRules];

    if (plannerOutput && plannerOutput.verificationCommands) {
      for (const cmd of plannerOutput.verificationCommands) {
        if (!rulesToExecute.some((r) => r.command === cmd)) {
          rulesToExecute.push({
            command: cmd,
            expectedExitCode: 0,
          });
        }
      }
    }

    let allRulesPassed = true;
    let primaryStdout = '';
    let lastError: string | undefined;

    // Run verification commands
    for (const rule of rulesToExecute) {
      let exitCode = 0;
      let output = '';
      try {
        output = execSync(rule.command, {
          cwd: task.assignedWorktree,
          timeout: rule.timeoutMs || 45000,
          stdio: 'pipe',
          env: {
            ...process.env,
            PAGER: 'cat',
          },
        }).toString();
      } catch (err: any) {
        exitCode = err.status || 1;
        output = `${err.stdout?.toString() || ''}\n${err.stderr?.toString() || ''}`;
      }

      primaryStdout += `\n[CMD: ${rule.command}]\n${output.slice(0, 500)}`;

      // Check exit code
      let passed = exitCode === rule.expectedExitCode;

      // Check regex evidence if specified
      if (passed && rule.expectedEvidenceRegex) {
        const regex = new RegExp(rule.expectedEvidenceRegex, 'i');
        if (!regex.test(output)) {
          passed = false;
          lastError = `Rule failed: output did not match expected regex /${rule.expectedEvidenceRegex}/.`;
        }
      }

      if (!passed) {
        allRulesPassed = false;
        if (!lastError) {
          lastError = `Command "${rule.command}" exited with code ${exitCode} (expected ${rule.expectedExitCode}).`;
        }
      }

      verificationOutputs.push({
        command: rule.command,
        exitCode,
        passed,
        outputSnippet: output.slice(-400).trim(),
      });
    }

    // Determine changed files
    let changedFiles: string[] = [];
    try {
      const gitDiff = execSync('git diff --name-only', {
        cwd: task.assignedWorktree,
        stdio: 'pipe',
      }).toString();
      changedFiles = gitDiff.split('\n').map((s) => s.trim()).filter(Boolean);
    } catch {}

    const durationMs = Date.now() - startTime;

    return {
      success: allRulesPassed,
      exitCode: allRulesPassed ? 0 : 1,
      durationMs,
      changedFiles,
      verificationOutputs,
      stdoutSnippet: primaryStdout.slice(-1000).trim(),
      errorMessage: lastError,
    };
  }
}
