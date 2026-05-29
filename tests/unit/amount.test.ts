import { describe, expect, it } from 'vitest';
import { validateAmount } from '../../src/validation/amount.js';

describe('validateAmount', () => {
  it('accepts a positive whole number and returns it', () => {
    expect(validateAmount(100)).toBe(100);
    expect(validateAmount(1)).toBe(1);
  });

  it('rejects zero and negatives', () => {
    expect(() => validateAmount(0)).toThrow();
    expect(() => validateAmount(-5)).toThrow();
  });

  it('rejects fractional amounts (STK is whole KES, no cents)', () => {
    expect(() => validateAmount(10.5)).toThrow();
  });

  it('rejects NaN, Infinity, and non-numbers', () => {
    expect(() => validateAmount(Number.NaN)).toThrow();
    expect(() => validateAmount(Number.POSITIVE_INFINITY)).toThrow();
    // @ts-expect-error — exercising runtime guard against non-number input
    expect(() => validateAmount('100')).toThrow();
  });
});
