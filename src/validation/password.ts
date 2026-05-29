/**
 * STK Push password derivation.
 *
 * `base64(shortcode + passkey + timestamp)` — the concatenation order is
 * significant (gotcha #4). The timestamp must be the same value sent as
 * `Timestamp` in the STK request.
 */

/** UTF-8 → base64, portable across Node 20+ and edge runtimes (no Buffer). */
function toBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Build the STK Push `Password`: `base64(shortcode + passkey + timestamp)`.
 */
export function generatePassword(shortcode: string, passkey: string, timestamp: string): string {
  return toBase64(`${shortcode}${passkey}${timestamp}`);
}
