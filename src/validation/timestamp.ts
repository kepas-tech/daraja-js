/**
 * Daraja timestamp formatting.
 *
 * STK Push expects `YYYYMMDDHHMMSS` in UTC, zero-padded (gotcha #3). The same
 * value feeds the STK password derivation, so both must agree on the instant.
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * Format a date as `YYYYMMDDHHMMSS` in UTC. Defaults to now.
 */
export function makeTimestamp(date: Date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}
