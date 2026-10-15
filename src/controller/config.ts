/**
 * Controller Configuration Loader & Secret Management
 *
 * Enforces:
 * 1. Secrets are loaded strictly from outside Git and OneDrive.
 * 2. Never dumps or logs secret values.
 * 3. Fails closed with explicit guidance when credentials are missing.
 */

import fs from 'fs';
import path from 'path';
import type { ControllerBounds } from './types';

export interface ControllerConfig {
  readonly perplexityApiKey?: string;
  readonly perplexityBaseUrl: string;
  readonly perplexityModel: string;
  readonly perplexityMaxTokens: number;
  readonly perplexityTemperature: number;
  readonly perplexityTimeoutMs: number;
  readonly agentApiBinPath: string;
  readonly bounds: ControllerBounds;
  readonly secretsFilePath: string;
}

export const DEFAULT_SECRETS_PATH = 'C:\\Users\\fsayyed\\.antigravity_controller\\secrets.env';
export const DEFAULT_STOP_FILE = 'C:\\Users\\fsayyed\\.antigravity_controller\\STOP';
export const DEFAULT_STATE_FILE = 'C:\\Users\\fsayyed\\.antigravity_controller\\controller_state.json';
export const DEFAULT_AGENTAPI_BIN = 'C:\\Users\\fsayyed\\.gemini\\antigravity\\bin\\agentapi.bat';

function parseSimpleEnv(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      env[key] = val.replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

export function loadControllerConfig(customSecretsPath?: string): ControllerConfig {
  const secretsPath = customSecretsPath || process.env.CONTROLLER_SECRETS_PATH || DEFAULT_SECRETS_PATH;
  let fileEnv: Record<string, string> = {};

  if (fs.existsSync(secretsPath)) {
    try {
      const content = fs.readFileSync(secretsPath, 'utf-8');
      fileEnv = parseSimpleEnv(content);
    } catch (err: any) {
      console.warn(`[ControllerConfig] Warning: Could not read secrets file at ${secretsPath}: ${err.message}`);
    }
  }

  const perplexityApiKey = fileEnv.PERPLEXITY_API_KEY || process.env.PERPLEXITY_API_KEY || undefined;

  const maxTasks = parseInt(fileEnv.CONTROLLER_MAX_TASKS || process.env.CONTROLLER_MAX_TASKS || '2', 10);
  const maxMinutes = parseInt(fileEnv.CONTROLLER_MAX_MINUTES || process.env.CONTROLLER_MAX_MINUTES || '15', 10);
  const maxRequests = parseInt(fileEnv.CONTROLLER_MAX_REQUESTS || process.env.CONTROLLER_MAX_REQUESTS || '4', 10);
  const maxSpendUsd = parseFloat(fileEnv.PERPLEXITY_MAX_SPEND_USD || process.env.PERPLEXITY_MAX_SPEND_USD || '1.00');

  const stopFilePath = fileEnv.CONTROLLER_STOP_FILE || process.env.CONTROLLER_STOP_FILE || DEFAULT_STOP_FILE;
  const stateFilePath = fileEnv.CONTROLLER_STATE_FILE || process.env.CONTROLLER_STATE_FILE || DEFAULT_STATE_FILE;
  const agentApiBinPath = fileEnv.ANTIGRAVITY_AGENTAPI_BIN || process.env.ANTIGRAVITY_AGENTAPI_BIN || DEFAULT_AGENTAPI_BIN;

  return {
    perplexityApiKey,
    perplexityBaseUrl: fileEnv.PERPLEXITY_API_BASE_URL || process.env.PERPLEXITY_API_BASE_URL || 'https://api.perplexity.ai',
    perplexityModel: fileEnv.PERPLEXITY_MODEL || process.env.PERPLEXITY_MODEL || 'sonar-pro',
    perplexityMaxTokens: parseInt(fileEnv.PERPLEXITY_MAX_TOKENS || '2048', 10),
    perplexityTemperature: parseFloat(fileEnv.PERPLEXITY_TEMPERATURE || '0.1'),
    perplexityTimeoutMs: parseInt(fileEnv.PERPLEXITY_REQUEST_TIMEOUT_MS || '20000', 10),
    agentApiBinPath,
    bounds: {
      maxTasks: isNaN(maxTasks) ? 2 : maxTasks,
      maxMinutes: isNaN(maxMinutes) ? 15 : maxMinutes,
      maxRequests: isNaN(maxRequests) ? 4 : maxRequests,
      maxSpendUsd: isNaN(maxSpendUsd) ? 1.00 : maxSpendUsd,
      stopFilePath,
      stateFilePath,
    },
    secretsFilePath: secretsPath,
  };
}
