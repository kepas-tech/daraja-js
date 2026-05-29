/** Internal utilities. Not part of the public API. */

/**
 * Normalize a value Daraja may send as an array, a single object, or omit.
 *
 * Daraja collapses single-element collections to a bare object — e.g. a result
 * with one parameter sends `ResultParameters.ResultParameter` as `{Key,Value}`
 * instead of `[{Key,Value}]` (observed in production). `?? []` does not handle
 * this (a non-null object passes through and crashes `for…of`); this does.
 */
export function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}
