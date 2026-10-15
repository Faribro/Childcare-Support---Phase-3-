/**
 * Bounded Perplexity Planning & Review Client
 *
 * Enforces:
 * 1. Strict JSON schema validation on all model responses.
 * 2. Whitelist enforcement on any suggested commands (never executes arbitrary shell scripts).
 * 3. Token, request count, and spend ceilings.
 * 4. Fails closed on missing credentials, network errors, or malformed JSON.
 */

import type { TaskDefinition, PlannerStructuredResponse, ControllerMetrics, ControllerBounds } from './types';
import type { ControllerConfig } from './config';

export const ALLOWED_COMMAND_PREFIXES = [
  'npm run typecheck',
  'npm run lint',
  'npm test',
  'npx vitest run',
  'git status',
  'git diff',
  'git log',
] as const;

export function isCommandPermitted(command: string): boolean {
  const trimmed = command.trim();
  // Reject chained commands or shell injection characters
  if (trimmed.includes(';') || trimmed.includes('&') || trimmed.includes('|') || trimmed.includes('`') || trimmed.includes('$')) {
    return false;
  }
  return ALLOWED_COMMAND_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

export interface IPlannerClient {
  planTask(task: TaskDefinition, projectBrief: string): Promise<PlannerStructuredResponse>;
}

export class MockPerplexityPlanner implements IPlannerClient {
  public planCallCount = 0;
  private customResponse?: Partial<PlannerStructuredResponse>;

  constructor(customResponse?: Partial<PlannerStructuredResponse>) {
    this.customResponse = customResponse;
  }

  public setResponse(res: Partial<PlannerStructuredResponse>): void {
    this.customResponse = res;
  }

  public async planTask(task: TaskDefinition, projectBrief: string): Promise<PlannerStructuredResponse> {
    this.planCallCount += 1;
    return {
      taskId: task.id,
      approvedToExecute: this.customResponse?.approvedToExecute ?? true,
      strategyExplanation: this.customResponse?.strategyExplanation || `Mock planned strategy for task ${task.id}`,
      boundedInstructions: this.customResponse?.boundedInstructions || `Bounded task instructions for ${task.title}`,
      filesToInspect: this.customResponse?.filesToInspect || task.targetFiles,
      filesToModify: this.customResponse?.filesToModify || [],
      verificationCommands: this.customResponse?.verificationCommands || ['npm run typecheck', 'npx vitest run src/test/baseline.test.ts'],
      potentialRisks: this.customResponse?.potentialRisks || ['None identified in mock scope'],
      requiresHumanApproval: this.customResponse?.requiresHumanApproval ?? false,
      rejectionReason: this.customResponse?.rejectionReason,
    };
  }
}

/**
 * Antigravity Native Planner
 *
 * Operates autonomously within Antigravity without requiring external LLM API credentials.
 * Synthesizes execution strategy directly from approved task specifications, target files,
 * and whitelisted verification commands.
 *
 * Truthful attribution: This is a deterministic rule-based planner implementing
 * verified safety bounds, whitelist enforcement, and structured schema conformity.
 * It does not pretend to be an external model.
 */
export class AntigravityNativePlanner implements IPlannerClient {
  public planCallCount = 0;

  public async planTask(task: TaskDefinition, projectBrief: string): Promise<PlannerStructuredResponse> {
    this.planCallCount += 1;

    // Filter verification commands through strict whitelist
    const verificationCommands = (task.verificationRules || [])
      .map((r) => r.command)
      .filter((cmd) => isCommandPermitted(cmd));

    if (verificationCommands.length === 0) {
      verificationCommands.push('git status');
    }

    return {
      taskId: task.id,
      approvedToExecute: !task.requiresApproval,
      strategyExplanation: `Antigravity Native Planner: Autonomous local planning for "${task.title}". Worktree: ${task.assignedWorktree}, Branch: ${task.assignedBranch}. Whitelisted commands: ${verificationCommands.length}. Mode: Credential-free local execution.`,
      boundedInstructions: task.promptContext || `Execute approved local action for ${task.title}.`,
      filesToInspect: task.targetFiles ? [...task.targetFiles] : [],
      filesToModify: (task.actionType === 'INSPECTION' || task.actionType === 'TEST_EXECUTION' || task.actionType === 'TYPECHECK')
        ? []
        : (task.targetFiles ? [...task.targetFiles] : []),
      verificationCommands,
      potentialRisks: task.requiresApproval
        ? ['Requires explicit human approval prior to local execution']
        : ['Preserve single-writer worktree lock', 'Zero unapproved network egress'],
      requiresHumanApproval: !!task.requiresApproval,
    };
  }
}

export class PerplexityApiClient implements IPlannerClient {
  private readonly config: ControllerConfig;
  private readonly metrics: ControllerMetrics;

  constructor(config: ControllerConfig, metrics: ControllerMetrics) {
    this.config = config;
    this.metrics = metrics;
  }

  public async planTask(task: TaskDefinition, projectBrief: string): Promise<PlannerStructuredResponse> {
    // 1. Credential Check (Fail-closed)
    if (!this.config.perplexityApiKey) {
      throw new Error(
        `CREDENTIALS_MISSING: PERPLEXITY_API_KEY is not configured. Please add your key to ${this.config.secretsFilePath}.`
      );
    }

    // 2. Budget and Request Ceiling Checks
    if (this.metrics.requestsCount >= this.config.bounds.maxRequests) {
      throw new Error(
        `BOUND_EXCEEDED: Maximum permitted Perplexity requests (${this.config.bounds.maxRequests}) reached for this run.`
      );
    }

    if (this.metrics.estimatedCostUsd >= this.config.bounds.maxSpendUsd) {
      throw new Error(
        `SPEND_CEILING_EXCEEDED: Estimated spend ($${this.metrics.estimatedCostUsd.toFixed(2)}) has reached the maximum approved limit of $${this.config.bounds.maxSpendUsd.toFixed(2)}.`
      );
    }

    // 3. Construct Sanitized Prompt (zero PII, zero credentials)
    const systemPrompt = `You are an automated software engineering planning agent.
Your task is to review and provide structured execution instructions for a local development task.
DO NOT suggest arbitrary commands, deployments, pushes, cloud changes, or access to operational data.
You MUST output ONLY a valid JSON object matching the following TypeScript interface:
{
  "taskId": string,
  "approvedToExecute": boolean,
  "strategyExplanation": string,
  "boundedInstructions": string,
  "filesToInspect": string[],
  "filesToModify": string[],
  "verificationCommands": string[],
  "potentialRisks": string[],
  "requiresHumanApproval": boolean,
  "rejectionReason"?: string
}
Allowed verification command prefixes ONLY: npm run typecheck, npm run lint, npx vitest run, git status, git diff.`;

    const userPrompt = `Project Context:
${projectBrief}

Task To Plan:
ID: ${task.id}
Title: ${task.title}
Action Type: ${task.actionType}
Assigned Worktree: ${task.assignedWorktree}
Target Files: ${task.targetFiles.join(', ')}
Task Details:
${task.promptContext}

Provide the structured planning JSON.`;

    // 4. Dispatch Request via Fetch
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.perplexityTimeoutMs);

    let rawJson: any;
    try {
      this.metrics.requestsCount += 1;
      const res = await fetch(`${this.config.perplexityBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.perplexityApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.perplexityModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: this.config.perplexityMaxTokens,
          temperature: this.config.perplexityTemperature,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Perplexity API error (HTTP ${res.status}): ${errText}`);
      }

      rawJson = await res.json();
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Perplexity API timed out after ${this.config.perplexityTimeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    // 5. Track Usage and Estimated Cost
    const usage = rawJson?.usage;
    const promptTokens = usage?.prompt_tokens || 0;
    const completionTokens = usage?.completion_tokens || 0;
    const totalTokens = promptTokens + completionTokens;
    this.metrics.totalTokensUsed += totalTokens;
    // Conservative estimation: $5 per 1M tokens ($0.000005 per token)
    this.metrics.estimatedCostUsd += (totalTokens * 0.000005);

    // 6. Validate Model Output Schema
    const content = rawJson?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error('PLANNER_MALFORMED_OUTPUT: Perplexity response contained empty content.');
    }

    // Extract JSON from potential code fences
    const cleanContent = content.replace(/```(?:json)?/gi, '').trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleanContent);
    } catch {
      throw new Error(`PLANNER_MALFORMED_JSON: Failed to parse planner response as JSON.`);
    }

    // Schema assertions
    if (typeof parsed.taskId !== 'string' || typeof parsed.approvedToExecute !== 'boolean') {
      throw new Error(`PLANNER_SCHEMA_VIOLATION: Missing required fields taskId or approvedToExecute.`);
    }

    const verificationCommands: string[] = Array.isArray(parsed.verificationCommands)
      ? parsed.verificationCommands
      : [];

    // Verify all verification commands against whitelist
    for (const cmd of verificationCommands) {
      if (!isCommandPermitted(cmd)) {
        parsed.approvedToExecute = false;
        parsed.requiresHumanApproval = true;
        parsed.rejectionReason = `Security Violation: Planner suggested unwhitelisted command "${cmd}".`;
        break;
      }
    }

    return {
      taskId: parsed.taskId,
      approvedToExecute: parsed.approvedToExecute,
      strategyExplanation: String(parsed.strategyExplanation || ''),
      boundedInstructions: String(parsed.boundedInstructions || ''),
      filesToInspect: Array.isArray(parsed.filesToInspect) ? parsed.filesToInspect : [],
      filesToModify: Array.isArray(parsed.filesToModify) ? parsed.filesToModify : [],
      verificationCommands,
      potentialRisks: Array.isArray(parsed.potentialRisks) ? parsed.potentialRisks : [],
      requiresHumanApproval: Boolean(parsed.requiresHumanApproval),
      rejectionReason: parsed.rejectionReason,
    };
  }
}
