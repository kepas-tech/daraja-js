import { describe, expect, it } from 'vitest';
import {
  DarajaAPIError,
  DarajaAuthError,
  DarajaCancelledError,
  DarajaConnectionError,
  DarajaError,
  DarajaInsufficientFundsError,
  DarajaUserUnreachableError,
  DarajaValidationError,
  errorFromResult,
} from '../../src/errors.js';

describe('error hierarchy', () => {
  it('DarajaError is a real Error subclass with a name', () => {
    const err = new DarajaError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('DarajaError');
    expect(err.message).toBe('boom');
  });

  it('every typed error extends DarajaError', () => {
    for (const E of [
      DarajaValidationError,
      DarajaAuthError,
      DarajaConnectionError,
      DarajaAPIError,
    ]) {
      expect(new E('x')).toBeInstanceOf(DarajaError);
    }
  });

  it('DarajaAPIError carries resultCode, resultDesc, and requestId', () => {
    const err = new DarajaAPIError('failed', {
      resultCode: 26,
      resultDesc: 'System busy',
      requestId: 'AG_123',
    });
    expect(err.resultCode).toBe(26);
    expect(err.resultDesc).toBe('System busy');
    expect(err.requestId).toBe('AG_123');
  });
});

describe('errorFromResult', () => {
  const ctx = { requestId: 'AG_1' };

  it('maps ResultCode 1 to DarajaInsufficientFundsError', () => {
    const err = errorFromResult({ resultCode: 1, resultDesc: 'Insufficient', ...ctx });
    expect(err).toBeInstanceOf(DarajaInsufficientFundsError);
    expect(err).toBeInstanceOf(DarajaAPIError);
    expect(err.resultCode).toBe(1);
  });

  it('maps ResultCode 1037 to DarajaUserUnreachableError (most common in prod)', () => {
    const err = errorFromResult({ resultCode: 1037, resultDesc: 'DS timeout', ...ctx });
    expect(err).toBeInstanceOf(DarajaUserUnreachableError);
  });

  it('maps ResultCode 1032 to DarajaCancelledError', () => {
    const err = errorFromResult({
      resultCode: 1032,
      resultDesc: 'Request cancelled by user',
      ...ctx,
    });
    expect(err).toBeInstanceOf(DarajaCancelledError);
  });

  it('falls back to a generic DarajaAPIError for unmapped codes', () => {
    const err = errorFromResult({ resultCode: 26, resultDesc: 'System busy', ...ctx });
    expect(err).toBeInstanceOf(DarajaAPIError);
    expect(err.constructor).toBe(DarajaAPIError);
    expect(err.resultDesc).toBe('System busy');
  });
});
