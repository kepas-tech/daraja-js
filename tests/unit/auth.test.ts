import { describe, expect, it, vi } from 'vitest';
import { TokenManager } from '../../src/auth.js';

/** A controllable clock so token expiry is deterministic. */
function clock(startMs = 0) {
  let t = startMs;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('TokenManager', () => {
  it('fetches a token on first use and returns it', async () => {
    const fetchToken = vi.fn().mockResolvedValue({ access_token: 'tok-1', expires_in: 3599 });
    const tm = new TokenManager({ fetchToken });

    expect(await tm.getToken()).toBe('tok-1');
    expect(fetchToken).toHaveBeenCalledTimes(1);
  });

  it('caches the token across calls within its TTL', async () => {
    const fetchToken = vi.fn().mockResolvedValue({ access_token: 'tok-1', expires_in: 3599 });
    const c = clock();
    const tm = new TokenManager({ fetchToken, now: c.now });

    await tm.getToken();
    c.advance(3000 * 1000); // 3000s — still inside TTL
    await tm.getToken();

    expect(fetchToken).toHaveBeenCalledTimes(1);
  });

  it('refreshes after the TTL (minus safety margin) elapses', async () => {
    const fetchToken = vi
      .fn()
      .mockResolvedValueOnce({ access_token: 'tok-1', expires_in: 3599 })
      .mockResolvedValueOnce({ access_token: 'tok-2', expires_in: 3599 });
    const c = clock();
    const tm = new TokenManager({ fetchToken, now: c.now });

    expect(await tm.getToken()).toBe('tok-1');
    c.advance(3599 * 1000); // full TTL elapsed
    expect(await tm.getToken()).toBe('tok-2');
    expect(fetchToken).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent refreshes into a single fetch (race-safe)', async () => {
    let resolve!: (v: { access_token: string; expires_in: number }) => void;
    const fetchToken = vi.fn().mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const tm = new TokenManager({ fetchToken });

    const a = tm.getToken();
    const b = tm.getToken();
    const c = tm.getToken();
    resolve({ access_token: 'tok-1', expires_in: 3599 });

    expect(await Promise.all([a, b, c])).toEqual(['tok-1', 'tok-1', 'tok-1']);
    expect(fetchToken).toHaveBeenCalledTimes(1);
  });

  it('retries the fetch on the next call after a failure (no poisoned cache)', async () => {
    const fetchToken = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ access_token: 'tok-1', expires_in: 3599 });
    const tm = new TokenManager({ fetchToken });

    await expect(tm.getToken()).rejects.toThrow('network');
    expect(await tm.getToken()).toBe('tok-1');
    expect(fetchToken).toHaveBeenCalledTimes(2);
  });
});
