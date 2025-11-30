/**
 * Cart and Discount Calculators - Unified exports
 *
 * This module provides client-side financial calculations that mirror
 * the backend order and discount calculation logic.
 *
 * @module calculators
 */

// Money utilities (shared by Cart and Discount calculators)
export {
  quantize,
  toMinor,
  fromMinor,
  currencyExponent,
  allocateMinor,
} from '../moneyUtils';

// Cart totals calculation
export {
  calculateCartTotals,
  calculateSurcharge,
  getCalculationSettings,
  _internal as moneyUtils, // Backwards compatibility alias
} from '../CartCalculator';

// Discount calculation
export {
  DiscountType,
  DiscountScope,
  isDiscountActive,
  calculateDiscountAmount,
  calculateAllDiscounts,
  validateDiscountApplication,
  findApplicableDiscounts,
  _strategies as discountStrategies,
} from '../DiscountCalculator';
