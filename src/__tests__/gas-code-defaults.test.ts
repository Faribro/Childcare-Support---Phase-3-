import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('gas/Code.js Literal Fallback Regression Guard', () => {
  it('strictly ensures NO non-empty string literal fallbacks exist in row column assignments', () => {
    const codePath = path.resolve(process.cwd(), 'gas/Code.js');
    const content = fs.readFileSync(codePath, 'utf8');
    const lines = content.split('\n');

    const FORBIDDEN_DEFAULTS = [
      'Male',
      'Female',
      'Maharashtra',
      'Pune',
      'Daily wage labour',
      'Normal',
      'On ART',
      'Tested in last 6 months',
      '< 50',
      'Undetectable (<50 copies/mL)',
      'Good',
      'Currently going to school',
      'Government school',
      'Regular',
      'India HIV/AIDS Alliance',
    ];

    const violations: string[] = [];

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      // Match assignments to row[index] in handleCreate_ / mapPayloadToRow_
      if (/row\[\d+\]\s*=/.test(line)) {
        FORBIDDEN_DEFAULTS.forEach((literal) => {
          // Check for || 'literal' or || "literal"
          const regex = new RegExp(`\\|\\|\\s*['"]${literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
          if (regex.test(line)) {
            violations.push(`Line ${lineNum}: Found hardcoded fallback literal "${literal}" in: ${line.trim()}`);
          }
        });
      }
    });

    expect(
      violations,
      `Detected hardcoded fallback literals in gas/Code.js:\n${violations.join('\n')}`
    ).toEqual([]);
  });
});
