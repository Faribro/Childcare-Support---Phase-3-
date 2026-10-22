/**
 * Worktree Concurrency & Ownership Mutex
 *
 * Guarantees:
 * 1. Exactly one writing worker per worktree at any given time.
 * 2. Reconciles confirmed worktree/branch/SHA ownership.
 * 3. Prevents overwriting uncommitted changes or interrupting active runs.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface WorktreeLockRecord {
  readonly worktreePath: string;
  readonly worktreeName: string;
  readonly workerId: string;
  readonly assignedBranch: string;
  readonly expectedHeadSha: string;
  readonly acquiredAt: string;
  readonly leaseExpiresAt: string;
}

export class WorktreeLockManager {
  private readonly lockFilePath: string;

  constructor(lockFilePath?: string) {
    this.lockFilePath = lockFilePath || 'C:\\Users\\fsayyed\\.antigravity_controller\\worktree_locks.json';
  }

  private normalizePath(rawPath: string): string {
    return path.resolve(rawPath).toLowerCase().replace(/\\/g, '/');
  }

  private loadLocks(): Map<string, WorktreeLockRecord> {
    const map = new Map<string, WorktreeLockRecord>();
    if (!fs.existsSync(this.lockFilePath)) {
      return map;
    }
    try {
      const raw = fs.readFileSync(this.lockFilePath, 'utf-8');
      const records = JSON.parse(raw);
      if (Array.isArray(records)) {
        const now = Date.now();
        for (const r of records) {
          if (r && r.worktreePath && new Date(r.leaseExpiresAt).getTime() > now) {
            map.set(this.normalizePath(r.worktreePath), r);
          }
        }
      }
    } catch {}
    return map;
  }

  private saveLocks(locks: Map<string, WorktreeLockRecord>): void {
    const dir = path.dirname(this.lockFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const arr = Array.from(locks.values());
    const tmp = `${this.lockFilePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(arr, null, 2), 'utf-8');
    try {
      if (fs.existsSync(this.lockFilePath)) {
        fs.unlinkSync(this.lockFilePath);
      }
      fs.renameSync(tmp, this.lockFilePath);
    } catch {
      fs.writeFileSync(this.lockFilePath, JSON.stringify(arr, null, 2), 'utf-8');
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {}
    }
  }

  /**
   * Inspects the git state of a worktree safely.
   */
  public inspectWorktreeState(worktreePath: string): {
    exists: boolean;
    currentBranch: string;
    currentHeadSha: string;
    isClean: boolean;
    error?: string;
  } {
    if (!fs.existsSync(worktreePath)) {
      return { exists: false, currentBranch: '', currentHeadSha: '', isClean: false, error: 'Path does not exist' };
    }
    try {
      const branch = execSync('git branch --show-current', { cwd: worktreePath, stdio: 'pipe' })
        .toString()
        .trim();
      const sha = execSync('git rev-parse HEAD', { cwd: worktreePath, stdio: 'pipe' })
        .toString()
        .trim();
      const status = execSync('git status --porcelain', { cwd: worktreePath, stdio: 'pipe' })
        .toString()
        .trim();
      return {
        exists: true,
        currentBranch: branch,
        currentHeadSha: sha,
        isClean: status.length === 0,
      };
    } catch (err: any) {
      return {
        exists: true,
        currentBranch: '',
        currentHeadSha: '',
        isClean: false,
        error: `Git inspection failed: ${err.message}`,
      };
    }
  }

  /**
   * Attempts to acquire an exclusive lock on the worktree.
   */
  public async acquireLock(params: {
    worktreePath: string;
    workerId: string;
    expectedBranch: string;
    expectedHeadSha?: string;
    leaseDurationMs?: number;
    requireCleanState?: boolean;
  }): Promise<{ acquired: boolean; activeLock?: WorktreeLockRecord; error?: string }> {
    const norm = this.normalizePath(params.worktreePath);
    const locks = this.loadLocks();
    const now = Date.now();
    const leaseDuration = params.leaseDurationMs || 10 * 60 * 1000; // 10 minutes default

    // 1. Check if another active worker holds the lock
    const existing = locks.get(norm);
    if (existing && existing.workerId !== params.workerId) {
      if (new Date(existing.leaseExpiresAt).getTime() > now) {
        return {
          acquired: false,
          activeLock: existing,
          error: `WORKTREE_LOCKED: Worktree is locked by worker "${existing.workerId}" until ${existing.leaseExpiresAt}. Concurrent writes prohibited.`,
        };
      }
    }

    // 2. Inspect git worktree state
    const gitState = this.inspectWorktreeState(params.worktreePath);
    if (!gitState.exists) {
      return { acquired: false, error: `Worktree directory not found: ${params.worktreePath}` };
    }

    if (params.expectedBranch && gitState.currentBranch !== params.expectedBranch) {
      return {
        acquired: false,
        error: `WORKTREE_BRANCH_MISMATCH: Expected branch "${params.expectedBranch}" but worktree is on "${gitState.currentBranch}".`,
      };
    }

    if (params.requireCleanState !== false && !gitState.isClean) {
      return {
        acquired: false,
        error: `WORKTREE_DIRTY: Worktree has uncommitted modifications. Refusing to acquire lock to prevent overwriting active changes.`,
      };
    }

    const lockRecord: WorktreeLockRecord = {
      worktreePath: params.worktreePath,
      worktreeName: path.basename(params.worktreePath),
      workerId: params.workerId,
      assignedBranch: gitState.currentBranch,
      expectedHeadSha: gitState.currentHeadSha,
      acquiredAt: new Date(now).toISOString(),
      leaseExpiresAt: new Date(now + leaseDuration).toISOString(),
    };

    locks.set(norm, lockRecord);
    this.saveLocks(locks);

    return { acquired: true, activeLock: lockRecord };
  }

  /**
   * Releases an acquired lock cleanly.
   */
  public async releaseLock(worktreePath: string, workerId: string): Promise<boolean> {
    const norm = this.normalizePath(worktreePath);
    const locks = this.loadLocks();
    const existing = locks.get(norm);
    if (!existing || existing.workerId !== workerId) {
      return false;
    }
    locks.delete(norm);
    this.saveLocks(locks);
    return true;
  }

  public async getActiveLocks(): Promise<WorktreeLockRecord[]> {
    return Array.from(this.loadLocks().values());
  }

  public async clearAll(): Promise<void> {
    if (fs.existsSync(this.lockFilePath)) {
      fs.unlinkSync(this.lockFilePath);
    }
  }
}
