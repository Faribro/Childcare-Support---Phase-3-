import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Firestore Composite Indexes Verification (firestore.indexes.json)', () => {
  const indexesPath = path.resolve(process.cwd(), 'firestore.indexes.json');

  it('contains valid, well-formed JSON with indexes array', () => {
    expect(fs.existsSync(indexesPath)).toBe(true);
    const raw = fs.readFileSync(indexesPath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed.indexes)).toBe(true);
    expect(parsed.indexes.length).toBeGreaterThanOrEqual(15);
  });

  it('indexes cover hot paths for submissions queries', () => {
    const raw = fs.readFileSync(indexesPath, 'utf-8');
    const { indexes } = JSON.parse(raw);

    const hasIndex = (collection: string, fields: string[]) => {
      return indexes.some(
        (idx: any) =>
          idx.collectionGroup === collection &&
          idx.fields.length === fields.length &&
          fields.every((f, i) => idx.fields[i].fieldPath === f)
      );
    };

    // 1. Submissions state + submissionTime
    expect(hasIndex('submissions', ['state', 'submissionTime'])).toBe(true);

    // 2. Submissions state + district + submissionTime
    expect(hasIndex('submissions', ['state', 'district', 'submissionTime'])).toBe(true);

    // 3. Submissions status + submissionTime
    expect(hasIndex('submissions', ['status', 'submissionTime'])).toBe(true);

    // 4. Submissions district + taluk + village + submissionTime
    expect(hasIndex('submissions', ['district', 'taluk', 'village', 'submissionTime'])).toBe(true);
  });

  it('indexes cover retry queues, leadership challenges, and background jobs', () => {
    const raw = fs.readFileSync(indexesPath, 'utf-8');
    const { indexes } = JSON.parse(raw);

    const hasIndex = (collection: string, fields: string[]) => {
      return indexes.some(
        (idx: any) =>
          idx.collectionGroup === collection &&
          idx.fields.length === fields.length &&
          fields.every((f, i) => idx.fields[i].fieldPath === f)
      );
    };

    // Sheets mirror worker queue
    expect(hasIndex('sheets_mirror_retry_queue', ['status', 'nextRetryAt'])).toBe(true);

    // Leader OTP challenges
    expect(hasIndex('leader_otp_challenges', ['email', 'isUsed', 'createdAt'])).toBe(true);

    // State team registrations
    expect(hasIndex('state_team_registrations', ['requestedState', 'status', 'createdAt'])).toBe(true);

    // Export delivery jobs
    expect(hasIndex('export_delivery_jobs', ['status', 'queuedAt'])).toBe(true);
  });

  it('all index fields specify valid sort orders', () => {
    const raw = fs.readFileSync(indexesPath, 'utf-8');
    const { indexes } = JSON.parse(raw);

    for (const idx of indexes) {
      expect(idx.collectionGroup).toBeTruthy();
      expect(idx.queryScope).toBe('COLLECTION');
      for (const field of idx.fields) {
        expect(['ASCENDING', 'DESCENDING']).toContain(field.order);
      }
    }
  });
});
