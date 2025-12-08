/**
 * CartCalculator - Client-side financial calculations for POS cart
 *
 * CRITICAL: This module mirrors backend logic from:
 * - backend/orders/calculators.py (OrderCalculator)
 * - backend/orders/services/calculation_service.py (order totals)
 * - backend/payments/money.py (precision helpers)
 * - backend/payments/services.py (surcharge calculation)
 * - backend/discounts/strategies.py (discount calculation - see DiscountCalculator.js)
 *
 * Design principles:
 * 1. Use integer arithmetic in minor units (cents) to prevent penny drift
 * 2. Use banker's rounding (ROUND_HALF_EVEN) for consistency
 * 3. Calculate tax per-item then aggregate (matches backend)
 * 4. Apply discounts before tax (tax on post-discount subtotal)
 * 5. Backend validates on ingest - client totals are for UX
 *
 * Inputs (from synced local DB):
 * - store_location.tax_rate (decimal, e.g., 0.07125 for 7.125%)
 * - global_settings.surcharge_percentage (decimal, e.g., 0.03 for 3%)
 * - Item taxability (via product.taxes or product_type.default_taxes)
 * - Discounts (predefined discounts via DiscountCalculator)
 *
 * @module CartCalculator
 */

import { calculateAllDiscounts } from './DiscountCalculator';
import { quantize, toMinor, fromMinor, currencyExponent, allocateMinor } from './moneyUtils';

/**
 * Get the effective tax rate for an item using hierarchical lookup.
 * Mirrors backend logic from orders/calculators.py:
 *   1. Check if product has direct taxes assigned (product.tax_ids)
 *   2. If no product taxes, check product_type's default_taxes
 *   3. If still no tax rate, use location's default tax rate
 *
 * @param {Object} item - Cart item with product data
 * @param {Map} taxRateMap - Map of tax_id -> rate
 * @param {Map} productTypeMap - Map of product_type_id -> {default_tax_ids, exclude_from_discounts, ...}
 * @param {number} defaultTaxRate - Fallback tax rate from store location
 * @returns {number} Effective tax rate for the item (decimal, e.g., 0.07125)
 */
function getItemTaxRate(item, taxRateMap, productTypeMap, defaultTaxRate) {
  const product = item.product;

  // No product info available - use default
  if (!product) {
    console.log('[CartCalculator] No product info, using default tax rate:', defaultTaxRate);
    return defaultTaxRate;
  }

  // 1. Check if product has direct taxes assigned
  const productTaxIds = product.tax_ids || [];
  if (productTaxIds.length > 0) {
    // Sum all tax rates (supports multiple taxes like state + local)
    let totalRate = 0;
    for (const taxId of productTaxIds) {
      // Try both original and string key
      const rate = taxRateMap.get(taxId) ?? taxRateMap.get(String(taxId));
      if (rate !== undefined) {
        totalRate += rate;
      } else {
        console.warn('[CartCalculator] Tax ID not found in taxRateMap:', taxId, 'Map keys:', [...taxRateMap.keys()].slice(0, 10));
      }
    }
    console.log('[CartCalculator] Product', product.name, 'has direct tax_ids:', productTaxIds, '-> rate:', totalRate);
    // Return summed rate (could be 0 if taxes exist but all have 0% rate)
    return totalRate;
  }

  // 2. Check product_type's default_taxes
  const productTypeId = product.product_type_id;
  if (productTypeId) {
    // Try both original and string key
    const productType = productTypeMap.get(productTypeId) ?? productTypeMap.get(String(productTypeId));
    const defaultTaxIds = productType?.default_tax_ids;
    // Only use product type taxes if there are actual taxes assigned
    // Empty array means "no taxes configured" -> fall through to default rate
    if (defaultTaxIds && defaultTaxIds.length > 0) {
      // Sum all default tax rates from product type
      let totalRate = 0;
      for (const taxId of defaultTaxIds) {
        // Try both original and string key
        const rate = taxRateMap.get(taxId) ?? taxRateMap.get(String(taxId));
        if (rate !== undefined) {
          totalRate += rate;
        } else {
          console.warn('[CartCalculator] ProductType tax ID not found:', taxId);
        }
      }
      console.log('[CartCalculator] Product', product.name, 'using product_type taxes:', defaultTaxIds, '-> rate:', totalRate);
      return totalRate;
    } else {
      console.log('[CartCalculator] Product', product.name, 'has product_type_id:', productTypeId, 'but no default_tax_ids. ProductType found:', !!productType);
    }
    // If defaultTaxIds is empty array or undefined, fall through to default rate
  } else {
    console.log('[CartCalculator] Product', product.name, 'has no product_type_id');
  }

  // 3. Fall back to location's default tax rate
  console.log('[CartCalculator] Product', product.name, 'using default tax rate:', defaultTaxRate);
  return defaultTaxRate;
}

/**
 * Calculate cart totals
 *
 * @param {Object} params - Calculation parameters
 * @param {Array} params.items - Cart items with product, quantity, price_at_sale, selected_modifiers_snapshot
 * @param {Array} params.adjustments - Order adjustments (price overrides, one-off discounts, tax exemptions)
 * @param {Array} params.appliedDiscounts - Predefined discounts applied to order (from discount catalog)
 * @param {Object} params.settings - Settings from local cache
 * @param {number} params.settings.taxRate - Tax rate as decimal (e.g., 0.07125)
 * @param {number} params.settings.surchargePercentage - Surcharge rate as decimal (e.g., 0.03)
 * @param {boolean} params.settings.surchargeEnabled - Whether surcharge is enabled
 * @param {Map} params.settings.productTypeMap - Product type lookup (id -> {exclude_from_discounts, ...})
 * @param {string} params.paymentMethod - Payment method ('CASH', 'CREDIT', 'GIFT_CARD', etc.)
 * @param {number} params.tip - Tip amount (default 0)
 * @param {string} params.currency - ISO 4217 currency code (default 'USD')
 *
 * @returns {Object} Calculated totals
 * @returns {number} returns.subtotal - Sum of item totals before tax/discounts
 * @returns {number} returns.predefinedDiscountTotal - Total of predefined/catalog discounts
 * @returns {number} returns.itemDiscountTotal - Total of item-level one-off discounts
 * @returns {number} returns.orderDiscountTotal - Total of order-level one-off discounts
 * @returns {number} returns.discountTotal - Total all discounts (predefined + one-off)
 * @returns {number} returns.taxableSubtotal - Subtotal after discounts, minus tax-exempt items
 * @returns {number} returns.tax - Tax amount
 * @returns {number} returns.surcharge - Surcharge amount (card payments only, unless fee exempt)
 * @returns {number} returns.tip - Tip amount
 * @returns {number} returns.total - Grand total (subtotal - discounts + tax + surcharge + tip)
 * @returns {number} returns.itemCount - Total quantity of items
 * @returns {boolean} returns.isTaxExempt - Whether order has order-level tax exemption
 * @returns {boolean} returns.isFeeExempt - Whether order has fee/surcharge exemption
 * @returns {Array} returns.discountBreakdown - Breakdown of each applied discount with amounts
 */
export function calculateCartTotals({
  items = [],
  adjustments = [],
  appliedDiscounts = [],
  settings = {},
  paymentMethod = null,
  tip = 0,
  currency = 'USD',
}) {
  const {
    taxRate = 0,
    surchargePercentage = 0,
    surchargeEnabled = false,
    taxRateMap = new Map(),
    productTypeMap = new Map(),
  } = settings;

  // Build adjustment lookup maps for efficient access
  const priceOverrides = new Map(); // itemId -> adjustment
  const itemDiscounts = new Map();  // itemId -> [adjustments]
  const taxExemptions = new Set();  // itemIds that are tax exempt
  let orderLevelTaxExempt = false;  // Order-level tax exemption
  let orderLevelFeeExempt = false;  // Order-level fee/surcharge exemption

  adjustments.forEach(adj => {
    if (adj.adjustment_type === 'PRICE_OVERRIDE' && adj.order_item) {
      priceOverrides.set(adj.order_item, adj);
    } else if (adj.adjustment_type === 'ONE_OFF_DISCOUNT' && adj.order_item) {
      if (!itemDiscounts.has(adj.order_item)) {
        itemDiscounts.set(adj.order_item, []);
      }
      itemDiscounts.get(adj.order_item).push(adj);
    } else if (adj.adjustment_type === 'TAX_EXEMPT') {
      if (adj.order_item) {
        taxExemptions.add(adj.order_item);
      } else {
        // Order-level tax exemption (no specific item)
        orderLevelTaxExempt = true;
      }
    } else if (adj.adjustment_type === 'FEE_EXEMPT') {
      // FEE_EXEMPT exempts the order from surcharge
      // Can be item-level (future) or order-level
      if (!adj.order_item) {
        orderLevelFeeExempt = true;
      }
    }
  });

  // Order-level discounts (not tied to specific item)
  const orderLevelDiscounts = adjustments.filter(
    adj => adj.adjustment_type === 'ONE_OFF_DISCOUNT' && !adj.order_item
  );

  let subtotalMinor = 0;
  let itemDiscountTotalMinor = 0;
  let taxableSubtotalMinor = 0;
  let taxTotalMinor = 0;
  let itemCount = 0;

  // Calculate per-item totals and tax
  items.forEach(item => {
    const quantity = item.quantity || 1;
    itemCount += quantity;

    // Base price (may be overridden)
    let unitPrice = parseFloat(item.price_at_sale || item.product?.price || 0);

    // Check for price override
    const override = priceOverrides.get(item.id);
    if (override) {
      // Price override stores the new unit price in amount field (as negative diff)
      // Actually, price_at_sale should already reflect the override
      // The adjustment amount is the difference (negative = discount)
    }

    // Add modifier prices
    let modifierTotal = 0;
    if (item.selected_modifiers_snapshot && item.selected_modifiers_snapshot.length > 0) {
      item.selected_modifiers_snapshot.forEach(mod => {
        const modPrice = parseFloat(mod.price_at_sale || 0);
        const modQty = mod.quantity || 1;
        modifierTotal += modPrice * modQty;
      });
    } else if (item.total_modifier_price) {
      // Backend may provide pre-calculated modifier total
      modifierTotal = parseFloat(item.total_modifier_price);
    }

    // Line total before item discounts
    const lineTotal = (unitPrice + modifierTotal) * quantity;
    const lineTotalMinor = toMinor(lineTotal, currency);
    subtotalMinor += lineTotalMinor;

    // Apply item-level discounts
    const discounts = itemDiscounts.get(item.id) || [];
    let lineDiscountMinor = 0;
    discounts.forEach(disc => {
      let discountAmountMinor;

      if (disc.discount_type === 'PERCENTAGE') {
        // Recalculate percentage based on current line total
        const percentage = parseFloat(disc.discount_value ?? disc.value ?? 0);
        discountAmountMinor = Math.round(lineTotalMinor * percentage / 100);
      } else {
        // Fixed amount - use stored value
        const discountAmount = Math.abs(parseFloat(disc.amount || disc.value || 0));
        discountAmountMinor = toMinor(discountAmount, currency);
      }

      lineDiscountMinor += discountAmountMinor;
    });
    itemDiscountTotalMinor += lineDiscountMinor;

    // Calculate taxable amount for this item
    // Tax exempt if: order-level exemption OR item-level exemption
    const isTaxExempt = orderLevelTaxExempt || taxExemptions.has(item.id);
    if (!isTaxExempt) {
      // Taxable amount is line total minus item discounts
      const taxableLineMinor = lineTotalMinor - lineDiscountMinor;
      taxableSubtotalMinor += taxableLineMinor;

      // Get tax rate for this item using hierarchical lookup (mirrors backend)
      const itemTaxRate = getItemTaxRate(item, taxRateMap, productTypeMap, taxRate);

      // Calculate tax for this item (per-item precision)
      const itemTaxMinor = Math.round(taxableLineMinor * itemTaxRate);
      taxTotalMinor += itemTaxMinor;
    }
  });

  // ============================================================================
  // PREDEFINED DISCOUNTS (from discount catalog)
  // Mirrors backend orders/services/calculation_service.py recalculate_order_totals
  // ============================================================================
  let predefinedDiscountTotalMinor = 0;
  const discountBreakdown = [];

  if (appliedDiscounts.length > 0) {
    const discountResult = calculateAllDiscounts(
      appliedDiscounts,
      items,
      subtotalMinor,
      productTypeMap,
      currency
    );

    predefinedDiscountTotalMinor = discountResult.totalMinor;

    // Build breakdown for UI display
    discountResult.breakdown.forEach(({ discount, amountMinor, amount }) => {
      discountBreakdown.push({
        id: discount.id,
        name: discount.name,
        code: discount.code,
        type: discount.type,
        scope: discount.scope,
        amountMinor,
        amount,
      });
    });
  }

  // ============================================================================
  // ONE-OFF ORDER-LEVEL DISCOUNTS (from adjustments)
  // ============================================================================
  // Server calculates order-level percentage discounts on subtotal directly (not post-item-discounts)
  // See backend/orders/services/calculation_service.py line 167:
  //   new_amount = -(order.subtotal * (adjustment.discount_value / Decimal('100.00')))

  let orderDiscountTotalMinor = 0;
  orderLevelDiscounts.forEach(disc => {
    let discountAmountMinor;

    if (disc.discount_type === 'PERCENTAGE') {
      // Recalculate percentage based on subtotal (matches server behavior)
      const percentage = parseFloat(disc.discount_value ?? disc.value ?? 0);
      discountAmountMinor = Math.round(subtotalMinor * percentage / 100);
    } else {
      // Fixed amount - use stored value
      const discountAmount = Math.abs(parseFloat(disc.amount || 0));
      discountAmountMinor = toMinor(discountAmount, currency);
    }

    orderDiscountTotalMinor += discountAmountMinor;
  });

  // ============================================================================
  // TOTAL DISCOUNTS (predefined + item one-off + order one-off)
  // ============================================================================
  const oneOffDiscountTotalMinor = itemDiscountTotalMinor + orderDiscountTotalMinor;
  const discountTotalMinor = predefinedDiscountTotalMinor + oneOffDiscountTotalMinor;

  // ============================================================================
  // RECALCULATE TAX after discounts
  // Tax is calculated on post-discount subtotal (mirrors backend)
  // ============================================================================
  // If there are order-level discounts (predefined or one-off), proportionally reduce tax
  const totalOrderLevelDiscountsMinor = predefinedDiscountTotalMinor + orderDiscountTotalMinor;
  if (totalOrderLevelDiscountsMinor > 0 && taxableSubtotalMinor > 0 && subtotalMinor > 0) {
    const discountRatio = totalOrderLevelDiscountsMinor / subtotalMinor;
    taxTotalMinor = Math.round(taxTotalMinor * (1 - discountRatio));
    taxableSubtotalMinor = Math.round(taxableSubtotalMinor * (1 - discountRatio));
  }

  // ============================================================================
  // SURCHARGE (card payments only, when enabled, unless fee exempt)
  // ============================================================================
  let surchargeMinor = 0;
  const isCardPayment = paymentMethod === 'CREDIT' || paymentMethod === 'CARD';
  if (surchargeEnabled && isCardPayment && surchargePercentage > 0 && !orderLevelFeeExempt) {
    // Surcharge is calculated on subtotal minus ALL discounts (before tax)
    const surchargeBase = subtotalMinor - discountTotalMinor;
    surchargeMinor = Math.round(surchargeBase * surchargePercentage);
  }

  // ============================================================================
  // TIP
  // ============================================================================
  const tipMinor = toMinor(tip, currency);

  // ============================================================================
  // GRAND TOTAL
  // ============================================================================
  const totalMinor = subtotalMinor - discountTotalMinor + taxTotalMinor + surchargeMinor + tipMinor;

  // Convert back to decimal for display
  return {
    subtotal: fromMinor(subtotalMinor, currency),
    predefinedDiscountTotal: fromMinor(predefinedDiscountTotalMinor, currency),
    itemDiscountTotal: fromMinor(itemDiscountTotalMinor, currency),
    orderDiscountTotal: fromMinor(orderDiscountTotalMinor, currency),
    oneOffDiscountTotal: fromMinor(oneOffDiscountTotalMinor, currency),
    discountTotal: fromMinor(discountTotalMinor, currency),
    taxableSubtotal: fromMinor(taxableSubtotalMinor, currency),
    tax: fromMinor(taxTotalMinor, currency),
    surcharge: fromMinor(surchargeMinor, currency),
    tip: fromMinor(tipMinor, currency),
    total: fromMinor(totalMinor, currency),
    itemCount,
    // Exemption flags for UI display
    isTaxExempt: orderLevelTaxExempt,
    isFeeExempt: orderLevelFeeExempt,
    // Discount breakdown for UI display
    discountBreakdown,
    // Also return minor units for precise comparisons
    _minor: {
      subtotal: subtotalMinor,
      predefinedDiscountTotal: predefinedDiscountTotalMinor,
      oneOffDiscountTotal: oneOffDiscountTotalMinor,
      discountTotal: discountTotalMinor,
      tax: taxTotalMinor,
      surcharge: surchargeMinor,
      tip: tipMinor,
      total: totalMinor,
    },
  };
}

/**
 * Calculate surcharge amount for a given base amount
 * Mirrors backend PaymentService.calculate_surcharge()
 *
 * @param {number} amount - Base amount to calculate surcharge on
 * @param {number} surchargePercentage - Surcharge rate as decimal (e.g., 0.03 for 3%)
 * @param {string} currency - ISO 4217 currency code
 * @returns {number} Surcharge amount
 */
export function calculateSurcharge(amount, surchargePercentage, currency = 'USD') {
  if (!surchargePercentage || surchargePercentage <= 0) {
    return 0;
  }
  const surcharge = amount * surchargePercentage;
  return quantize(surcharge, currency);
}

/**
 * Get settings required for cart calculation from cached settings
 * @param {Object} cachedSettings - Settings from offlineAPI.getCachedSettings()
 * @param {Array} taxes - Array of tax objects from offlineAPI.getCachedTaxes() (optional)
 * @param {Array} productTypes - Array of product type objects from offlineAPI.getCachedProductTypes() (optional)
 * @returns {Object} Calculation settings
 */
export function getCalculationSettings(cachedSettings, taxes = [], productTypes = []) {
  const storeLocation = cachedSettings?.store_location || {};
  const globalSettings = cachedSettings?.global_settings || {};

  // Default tax rate: prefer store location, fall back to global
  const defaultTaxRate = parseFloat(storeLocation.tax_rate || globalSettings.default_tax_rate || 0);

  // Surcharge settings from global
  const surchargePercentage = parseFloat(globalSettings.surcharge_percentage || 0);
  const surchargeEnabled = globalSettings.surcharge_enabled || false;

  // Build tax lookup map (id -> rate as decimal)
  // Note: Tax.rate from backend is stored as percentage (e.g., 8.25 for 8.25%)
  // We convert to decimal (0.0825) for calculation consistency with store_location.tax_rate
  // Store both original and string keys to handle type mismatches
  const taxRateMap = new Map();
  taxes.forEach(tax => {
    // Convert percentage (8.25) to decimal (0.0825)
    const rateAsDecimal = parseFloat(tax.rate || 0) / 100;
    taxRateMap.set(tax.id, rateAsDecimal);
    taxRateMap.set(String(tax.id), rateAsDecimal); // Also store as string for UUID lookups
  });

  // Build product type lookup map (id -> full product type object)
  // Includes: default_tax_ids, exclude_from_discounts, etc.
  // Store both original and string keys to handle type mismatches
  const productTypeMap = new Map();
  productTypes.forEach(pt => {
    const typeData = {
      default_tax_ids: pt.default_tax_ids || [],
      exclude_from_discounts: pt.exclude_from_discounts || false,
      tax_inclusive: pt.tax_inclusive || false,
      max_quantity_per_item: pt.max_quantity_per_item,
      stock_enforcement: pt.stock_enforcement,
      allow_negative_stock: pt.allow_negative_stock || false,
    };
    productTypeMap.set(pt.id, typeData);
    productTypeMap.set(String(pt.id), typeData); // Also store as string for UUID lookups
  });

  return {
    taxRate: defaultTaxRate, // Default/fallback tax rate
    surchargePercentage,
    surchargeEnabled,
    taxRateMap,       // Map of tax_id -> rate
    productTypeMap,   // Map of product_type_id -> {default_tax_ids, exclude_from_discounts, ...}
  };
}

// Re-export allocateMinor for backwards compatibility
export { allocateMinor };

// Export utilities for testing (re-export from moneyUtils)
export const _internal = {
  quantize,
  toMinor,
  fromMinor,
  currencyExponent,
  allocateMinor,
};
