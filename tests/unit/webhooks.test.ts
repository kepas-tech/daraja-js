import { describe, expect, it } from 'vitest';
import { DarajaSignatureError } from '../../src/errors.js';
import { webhooks } from '../../src/webhooks.js';

const SECRET = 'whsec_test';
const PAYLOAD = JSON.stringify({ event: 'wallet.reversal.completed', id: 'r-1' });

function clock(ms: number) {
  return () => ms;
}

describe('webhooks.sign + constructEvent (sync)', () => {
  it('round-trips: a signed payload verifies and returns the parsed event', () => {
    const now = clock(1_700_000_000_000);
    const sig = webhooks.sign({ payload: PAYLOAD, secret: SECRET, now });

    const event = webhooks.constructEvent({
      payload: PAYLOAD,
      signature: sig,
      secret: SECRET,
      now,
    });

    expect(event).toEqual({ event: 'wallet.reversal.completed', id: 'r-1' });
  });

  it('rejects a tampered payload', () => {
    const now = clock(1_700_000_000_000);
    const sig = webhooks.sign({ payload: PAYLOAD, secret: SECRET, now });

    expect(() =>
      webhooks.constructEvent({ payload: `${PAYLOAD} `, signature: sig, secret: SECRET, now }),
    ).toThrow(DarajaSignatureError);
  });

  it('rejects a wrong secret', () => {
    const now = clock(1_700_000_000_000);
    const sig = webhooks.sign({ payload: PAYLOAD, secret: SECRET, now });

    expect(() =>
      webhooks.constructEvent({ payload: PAYLOAD, signature: sig, secret: 'whsec_other', now }),
    ).toThrow(DarajaSignatureError);
  });

  it('rejects a signature outside the replay tolerance', () => {
    const signedAt = clock(1_700_000_000_000);
    const sig = webhooks.sign({ payload: PAYLOAD, secret: SECRET, now: signedAt });

    // 6 minutes later, tolerance 300s
    const later = clock(1_700_000_000_000 + 360_000);
    expect(() =>
      webhooks.constructEvent({
        payload: PAYLOAD,
        signature: sig,
        secret: SECRET,
        toleranceSec: 300,
        now: later,
      }),
    ).toThrow(DarajaSignatureError);
  });

  it('rejects a malformed signature header', () => {
    expect(() =>
      webhooks.constructEvent({ payload: PAYLOAD, signature: 'garbage', secret: SECRET }),
    ).toThrow(DarajaSignatureError);
  });
});

describe('webhooks.constructEventAsync (WebCrypto)', () => {
  it('round-trips with the async verifier', async () => {
    const now = clock(1_700_000_000_000);
    const sig = webhooks.sign({ payload: PAYLOAD, secret: SECRET, now });

    const event = await webhooks.constructEventAsync({
      payload: PAYLOAD,
      signature: sig,
      secret: SECRET,
      now,
    });

    expect(event).toEqual({ event: 'wallet.reversal.completed', id: 'r-1' });
  });

  it('rejects a tampered payload asynchronously', async () => {
    const now = clock(1_700_000_000_000);
    const sig = webhooks.sign({ payload: PAYLOAD, secret: SECRET, now });

    await expect(
      webhooks.constructEventAsync({ payload: `${PAYLOAD}x`, signature: sig, secret: SECRET, now }),
    ).rejects.toBeInstanceOf(DarajaSignatureError);
  });
});
