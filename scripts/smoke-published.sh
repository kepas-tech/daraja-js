#!/usr/bin/env bash
# Post-release smoke: install the PUBLISHED package from npm into a throwaway
# project and exercise the whole public surface. Proves the shipped artifact —
# packaging, exports, ESM+CJS — not the local source tree.
#
#   scripts/smoke-published.sh            # tests @latest
#   scripts/smoke-published.sh 0.2.0      # tests a specific version
set -euo pipefail

VER="${1:-latest}"
PKG="@kepas/daraja-js@${VER}"
DIR="$(mktemp -d)"
trap 'rm -rf "$DIR"' EXIT

echo "→ installing ${PKG} into a clean project…"
cd "$DIR"
npm init -y >/dev/null 2>&1
npm install "$PKG" >/dev/null 2>&1

cat > smoke.mjs <<'EOF'
import {
  VERSION, Daraja, DarajaValidationError,
  normalizePhone, phoneToNumber, generatePassword,
  parseStkCallback, parseC2bConfirmation, c2bAccept, c2bReject, webhooks,
} from '@kepas/daraja-js';

const assert = (cond, msg) => { if (!cond) { console.error('✗ ' + msg); process.exit(1); } };

assert(typeof VERSION === 'string' && VERSION !== '0.0.0', `VERSION sane (${VERSION})`);
assert(normalizePhone('0110123456') === '254110123456', 'normalizePhone 011');
assert(phoneToNumber('0712345678') === 254712345678, 'phoneToNumber → number');
assert(generatePassword('600999', 'pk', '20260101000000').length > 0, 'generatePassword');

const sig = webhooks.sign({ payload: '{"a":1}', secret: 's', timestamp: 1700000000 });
assert(webhooks.constructEvent({ payload: '{"a":1}', signature: sig, secret: 's', toleranceSec: 0 }).a === 1, 'webhook verify');

const stk = parseStkCallback({ Body: { stkCallback: { CheckoutRequestID: 'c', ResultCode: 0, ResultDesc: 'ok',
  CallbackMetadata: { Item: [{ Name: 'MpesaReceiptNumber', Value: 'ABC' }] } } } });
assert(stk.success && stk.mpesaReceiptNumber === 'ABC', 'parseStkCallback');

const c2b = parseC2bConfirmation({ TransID: 'RID', TransAmount: '10', MSISDN: '254708374149' });
assert(c2b.terminal === true && c2b.amount === 10, 'parseC2bConfirmation terminal+amount');
assert(c2bAccept().ResultCode === '0' && c2bReject().ResultCode === 'C2B00012', 'c2b responses');

let guarded = false;
try { new Daraja({ consumerKey: '', consumerSecret: 'x', shortcode: '1', passkey: 'p', environment: 'sandbox' }); }
catch (e) { guarded = e instanceof DarajaValidationError; }
assert(guarded, 'config guard throws DarajaValidationError');

console.log(`✓ published ${VERSION}: all public-surface checks passed`);
EOF

echo "→ ESM:"; node smoke.mjs
echo "→ CJS: $(node -e "console.log('require ok, VERSION', require('@kepas/daraja-js').VERSION)")"
