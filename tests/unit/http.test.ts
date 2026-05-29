import { delay, HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DarajaAPIError, DarajaAuthError, DarajaConnectionError } from '../../src/errors.js';
import { HttpClient } from '../../src/http.js';

const BASE = 'https://sandbox.safaricom.co.ke';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeClient(overrides: Record<string, unknown> = {}) {
  return new HttpClient({
    baseUrl: BASE,
    getToken: async () => 'tok-1',
    sleep: async () => {}, // instant backoff in tests
    ...overrides,
  });
}

describe('HttpClient.post', () => {
  it('POSTs JSON with a bearer token and returns the parsed body', async () => {
    let seenAuth: string | null = null;
    server.use(
      http.post(`${BASE}/x`, async ({ request }) => {
        seenAuth = request.headers.get('authorization');
        const body = await request.json();
        return HttpResponse.json({ ok: true, echo: body });
      }),
    );

    const res = await makeClient().post('/x', { a: 1 });

    expect(res).toEqual({ ok: true, echo: { a: 1 } });
    expect(seenAuth).toBe('Bearer tok-1');
  });

  it('maps HTTP 401 to DarajaAuthError', async () => {
    server.use(
      http.post(`${BASE}/x`, () =>
        HttpResponse.json({ errorMessage: 'bad token' }, { status: 401 }),
      ),
    );
    await expect(makeClient().post('/x', {})).rejects.toBeInstanceOf(DarajaAuthError);
  });

  it('retries on 5xx and succeeds on a later attempt', async () => {
    let calls = 0;
    server.use(
      http.post(`${BASE}/x`, () => {
        calls += 1;
        return calls < 2
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json({ ok: true });
      }),
    );

    const res = await makeClient({ maxRetries: 2 }).post('/x', {});

    expect(res).toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it('exhausts retries on persistent 5xx and throws DarajaAPIError', async () => {
    let calls = 0;
    server.use(
      http.post(`${BASE}/x`, () => {
        calls += 1;
        return new HttpResponse(null, { status: 500 });
      }),
    );

    await expect(makeClient({ maxRetries: 1 }).post('/x', {})).rejects.toBeInstanceOf(
      DarajaAPIError,
    );
    expect(calls).toBe(2); // 1 initial + 1 retry
  });

  it('does NOT retry a 4xx (client error)', async () => {
    let calls = 0;
    server.use(
      http.post(`${BASE}/x`, () => {
        calls += 1;
        return HttpResponse.json({ errorMessage: 'bad request' }, { status: 400 });
      }),
    );

    await expect(makeClient({ maxRetries: 2 }).post('/x', {})).rejects.toBeInstanceOf(
      DarajaAPIError,
    );
    expect(calls).toBe(1);
  });

  it('aborts on timeout and throws DarajaConnectionError', async () => {
    server.use(
      http.post(`${BASE}/x`, async () => {
        await delay(200);
        return HttpResponse.json({ ok: true });
      }),
    );

    await expect(makeClient({ timeoutMs: 30 }).post('/x', {})).rejects.toBeInstanceOf(
      DarajaConnectionError,
    );
  });
});
