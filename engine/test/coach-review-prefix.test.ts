import { describe, expect, it } from 'vitest';
import { stripReviewLineNumber } from '../src/copy-verify.js';

describe('coach critique list prefixes', () => {
  it('strips a numbered list prefix while preserving decimal timestamps', () => {
    expect(stripReviewLineNumber('12. 12.4 minutes: contest ended.')).toBe('12.4 minutes: contest ended.');
    expect(stripReviewLineNumber('12.4 minutes: contest ended.')).toBe('12.4 minutes: contest ended.');
    expect(stripReviewLineNumber('  3. A grounded verdict.')).toBe('A grounded verdict.');
  });
});
