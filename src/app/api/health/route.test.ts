import { describe, it, expect } from 'vitest';
import { GET } from './route';

describe('Health Check Probe API (TCK-003)', () => {
  it('should return HTTP 200 OK with status ok and version 3.0.0', async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('childcare-support-phase-3');
    expect(body.version).toBe('3.0.0');
    expect(typeof body.timestamp).toBe('string');
    expect(typeof body.uptimeSeconds).toBe('number');
  });
});
