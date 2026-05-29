/**
 * Amount validation.
 *
 * Daraja transacts in whole Kenyan shillings — no cents. STK Push, B2C, B2B all
 * expect a positive integer amount.
 */

/**
 * Validate a transaction amount and return it unchanged.
 *
 * @throws if the value is not a positive whole number.
 */
export function validateAmount(amount: number): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new Error('amount must be a finite number');
  }
  if (!Number.isInteger(amount)) {
    throw new Error('amount must be a whole number of KES (no cents)');
  }
  if (amount < 1) {
    throw new Error('amount must be at least 1 KES');
  }
  return amount;
}
