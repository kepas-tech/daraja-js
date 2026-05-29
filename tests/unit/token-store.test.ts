import { describe, expect, it, vi } from 'vitest';
import { TokenManager } from '../../src/auth.js';

/** A fake shared store (stands in for Redis across processes). */
function fakeStore() {
  const map = new Map<string, string>();
  return {
    map,
    store: {
      get: vi.fn(async (k: string) => map.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => {
        map.set(k, v);
      }),
    },
  };
}

function clock(startMs = 0) {
  let t = startMs;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('TokenManager with a shared TokenStore', () => {
  it('writes the token to the store after fetching', async () => {
    const { store, map } = fakeStore();
    const fetchToken = vi.fn().mockResolvedValue({ access_token: 'tok-1', expires_in: 3599 });
    const tm = new TokenManager({ fetchToken, store, cacheKey: 'prod' });

    await tm.getToken();

    expect(store.set).toHaveBeenCalledTimes(1);
    expect(map.size).toBe(1);
  });

  it('a second manager (another process) reuses the stored token without fetching', async () => {
    const shared = fakeStore();
    const c = clock();

    const fetchA = vi.fn().mockResolvedValue({ access_token: 'tok-1', expires_in: 3599 });
    const a = new TokenManager({
      fetchToken: fetchA,
      store: shared.store,
      cacheKey: 'prod',
      now: c.now,
    });
    expect(await a.getToken()).toBe('tok-1');
    expect(fetchA).toHaveBeenCalledTimes(1);

    // fresh instance, empty in-memory cache, same shared store + key
    const fetchB = vi.fn().mockResolvedValue({ access_token: 'tok-DIFFERENT', expires_in: 3599 });
    const b = new TokenManager({
      fetchToken: fetchB,
      store: shared.store,
      cacheKey: 'prod',
      now: c.now,
    });

    expect(await b.getToken()).toBe('tok-1'); // from the store, not its own fetch
    expect(fetchB).not.toHaveBeenCalled();
  });

  it('refetches when the stored token has expired', async () => {
    const shared = fakeStore();
    const c = clock();

    const a = new TokenManager({
      fetchToken: vi.fn().mockResolvedValue({ access_token: 'tok-1', expires_in: 3599 }),
      store: shared.store,
      cacheKey: 'prod',
      now: c.now,
    });
    await a.getToken();

    c.advance(3599 * 1000); // past TTL
    const fetchB = vi.fn().mockResolvedValue({ access_token: 'tok-2', expires_in: 3599 });
    const b = new TokenManager({
      fetchToken: fetchB,
      store: shared.store,
      cacheKey: 'prod',
      now: c.now,
    });

    expect(await b.getToken()).toBe('tok-2');
    expect(fetchB).toHaveBeenCalledTimes(1);
  });

  it('keeps an in-memory fast path (no store read on a warm hit)', async () => {
    const { store } = fakeStore();
    const fetchToken = vi.fn().mockResolvedValue({ access_token: 'tok-1', expires_in: 3599 });
    const c = clock();
    const tm = new TokenManager({ fetchToken, store, cacheKey: 'prod', now: c.now });

    await tm.getToken();
    store.get.mockClear();
    await tm.getToken(); // warm in-memory

    expect(store.get).not.toHaveBeenCalled();
    expect(fetchToken).toHaveBeenCalledTimes(1);
  });

  it('isolates tokens by cacheKey (sandbox vs prod — gotcha #12)', async () => {
    const shared = fakeStore();
    const prod = new TokenManager({
      fetchToken: vi.fn().mockResolvedValue({ access_token: 'prod-tok', expires_in: 3599 }),
      store: shared.store,
      cacheKey: 'prod',
    });
    const fetchSandbox = vi
      .fn()
      .mockResolvedValue({ access_token: 'sandbox-tok', expires_in: 3599 });
    const sandbox = new TokenManager({
      fetchToken: fetchSandbox,
      store: shared.store,
      cacheKey: 'sandbox',
    });

    await prod.getToken();
    expect(await sandbox.getToken()).toBe('sandbox-tok'); // not the prod token
    expect(fetchSandbox).toHaveBeenCalledTimes(1);
  });
});
