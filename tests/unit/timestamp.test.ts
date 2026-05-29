import { describe, expect, it } from 'vitest';
import { makeTimestamp } from '../../src/validation/timestamp.js';

describe('makeTimestamp', () => {
  it('formats a date as YYYYMMDDHHMMSS in UTC', () => {
    // 2026-05-29T08:07:05.000Z
    const d = new Date(Date.UTC(2026, 4, 29, 8, 7, 5));
    expect(makeTimestamp(d)).toBe('20260529080705');
  });

  it('zero-pads every field', () => {
    // 2026-01-02T03:04:05Z — all single-digit components
    const d = new Date(Date.UTC(2026, 0, 2, 3, 4, 5));
    expect(makeTimestamp(d)).toBe('20260102030405');
  });

  it('is always 14 characters', () => {
    const d = new Date(Date.UTC(2026, 11, 31, 23, 59, 59));
    expect(makeTimestamp(d)).toHaveLength(14);
  });

  it('uses UTC, not local time', () => {
    // Same instant; format must not shift with the host timezone.
    const d = new Date(Date.UTC(2026, 4, 29, 0, 0, 0));
    expect(makeTimestamp(d)).toBe('20260529000000');
  });
});
