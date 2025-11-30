/**
 * Money Utilities - Shared precision helpers for financial calculations
 *
 * CRITICAL: This module mirrors backend logic from:
 * - backend/payments/money.py (precision helpers)
 *
 * Design principles:
 * 1. Use integer arithmetic in minor units (cents) to prevent penny drift
 * 2. Use banker's rounding (ROUND_HALF_EVEN) for consistency
 *
 * @module moneyUtils
 */

// Currency exponents (decimal places) - matches backend/payments/money.py
const CURRENCY_EXPONENT = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  JPY: 0,
  KRW: 0,
};

/**
 * Get currency exponent (decimal places)
 * @param {string} currency - ISO 4217 currency code
 * @returns {number} Number of decimal places
 */
export function currencyExponent(currency = 'USD') {
  return CURRENCY_EXPONENT[currency.toUpperCase()] ?? 2;
}

/**
 * Round to currency precision using banker's rounding (ROUND_HALF_EVEN)
 * Mirrors backend payments/money.py quantize() using Python Decimal.
 *
 * IMPORTANT: JavaScript floats have precision issues. This implementation
 * uses epsilon comparison to handle cases like 2.5 * 100 = 249.99999999999997
 *
 * @param {number} amount - Amount to round
 * @param {string} currency - ISO 4217 currency code
 * @returns {number} Rounded amount
 */
export function quantize(amount, currency = 'USD') {
  const exp = currencyExponent(currency);
  const multiplier = Math.pow(10, exp);

  // Shift to integer space for comparison
  const shifted = amount * multiplier;
  const floor = Math.floor(shifted);
  const decimal = shifted - floor;

  // Use epsilon for floating-point comparison (handles 0.4999999999 vs 0.5)
  const EPSILON = 1e-9;
  const isHalf = Math.abs(decimal - 0.5) < EPSILON;

  if (isHalf) {
    // Banker's rounding: round to nearest even when exactly 0.5
    // 2.5 -> 2, 3.5 -> 4, 4.5 -> 4, 5.5 -> 6
    return (floor % 2 === 0 ? floor : floor + 1) / multiplier;
  }

  // Standard rounding for non-half cases
  return Math.round(shifted) / multiplier;
}

/**
 * Convert decimal amount to minor units (cents)
 * @param {number} amount - Amount in decimal
 * @param {string} currency - ISO 4217 currency code
 * @returns {number} Amount in minor units (integer)
 */
export function toMinor(amount, currency = 'USD') {
  const quantized = quantize(amount, currency);
  const exp = currencyExponent(currency);
  return Math.round(quantized * Math.pow(10, exp));
}

/**
 * Convert minor units (cents) to decimal amount
 * @param {number} minor - Amount in minor units
 * @param {string} currency - ISO 4217 currency code
 * @returns {number} Amount in decimal
 */
export function fromMinor(minor, currency = 'USD') {
  const exp = currencyExponent(currency);
  return minor / Math.pow(10, exp);
}

/**
 * Distribute an amount across multiple items with zero drift.
 * Mirrors backend payments/money.py allocate_minor().
 *
 * Uses largest-remainder method to ensure sum equals total exactly.
 * Example: allocateMinor(100, [1, 1, 1]) => [34, 33, 33] (sums to 100)
 *
 * @param {number} totalMinor - Total amount in minor units (cents) to distribute
 * @param {number[]} weights - Array of weights for distribution (e.g., item amounts)
 * @returns {number[]} Array of allocated amounts in minor units
 */
export function allocateMinor(totalMinor, weights) {
  if (!weights || weights.length === 0) {
    return [];
  }

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  // Handle edge case: all weights are zero
  if (totalWeight === 0) {
    // Distribute evenly, giving remainder to first items
    const base = Math.floor(totalMinor / weights.length);
    const remainder = totalMinor % weights.length;
    return weights.map((_, i) => base + (i < remainder ? 1 : 0));
  }

  // Calculate proportional amounts (may have fractional parts)
  const proportional = weights.map(w => (w / totalWeight) * totalMinor);

  // Floor each amount
  const floored = proportional.map(p => Math.floor(p));

  // Calculate remainders (fractional parts)
  const remainders = proportional.map((p, i) => ({
    index: i,
    remainder: p - floored[i],
  }));

  // Sort by remainder descending (largest first)
  remainders.sort((a, b) => b.remainder - a.remainder);

  // Calculate how many cents we need to distribute
  const flooredSum = floored.reduce((sum, f) => sum + f, 0);
  let remaining = totalMinor - flooredSum;

  // Distribute remaining cents to items with largest remainders
  const result = [...floored];
  for (const { index } of remainders) {
    if (remaining <= 0) break;
    result[index] += 1;
    remaining -= 1;
  }

  return result;
}
