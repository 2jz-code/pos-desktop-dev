/**
 * DiscountCalculator - Client-side discount calculations for POS cart
 *
 * CRITICAL: This module mirrors backend logic from:
 * - backend/discounts/strategies.py (all discount strategies)
 * - backend/discounts/services.py (discount application flow)
 * - backend/orders/services/calculation_service.py (order totals)
 *
 * Design principles:
 * 1. Use Strategy pattern matching backend architecture
 * 2. Use integer arithmetic in minor units (cents) to prevent penny drift
 * 3. Use banker's rounding (ROUND_HALF_EVEN) for consistency
 * 4. Respect exclude_from_discounts flag on product types
 * 5. Backend validates on ingest - client totals are for UX
 *
 * @module DiscountCalculator
 */

import { quantize, toMinor, fromMinor } from './moneyUtils';

// Discount types (matches backend discounts/models.py)
export const DiscountType = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED_AMOUNT: 'FIXED_AMOUNT',
  BUY_X_GET_Y: 'BUY_X_GET_Y',
};

// Discount scopes (matches backend discounts/models.py)
export const DiscountScope = {
  ORDER: 'ORDER',
  PRODUCT: 'PRODUCT',
  CATEGORY: 'CATEGORY',
};

/**
 * Check if a discount is currently active
 * @param {Object} discount - Discount object
 * @returns {boolean} Whether discount is active
 */
export function isDiscountActive(discount) {
  if (!discount.is_active) return false;

  const now = new Date();

  if (discount.start_date) {
    const startDate = new Date(discount.start_date);
    if (now < startDate) return false;
  }

  if (discount.end_date) {
    const endDate = new Date(discount.end_date);
    if (now > endDate) return false;
  }

  return true;
}

/**
 * Check if item should be excluded from discounts based on product type
 * @param {Object} item - Cart item
 * @param {Map} productTypeMap - Map of product_type_id -> product type data
 * @returns {boolean} Whether item is excluded from discounts
 */
function isItemExcludedFromDiscounts(item, productTypeMap) {
  const productTypeId = item.product?.product_type_id;
  if (!productTypeId) return false;

  const productType = productTypeMap.get(productTypeId);
  return productType?.exclude_from_discounts === true;
}

/**
 * Get items that are eligible for discounts (not excluded by product type)
 * @param {Array} items - Cart items
 * @param {Map} productTypeMap - Map of product_type_id -> product type data
 * @returns {Array} Items eligible for discounts
 */
function getDiscountableItems(items, productTypeMap) {
  return items.filter(item => !isItemExcludedFromDiscounts(item, productTypeMap));
}

/**
 * Calculate item total (price + modifiers) * quantity
 * @param {Object} item - Cart item
 * @returns {number} Item total in decimal
 */
function getItemTotal(item) {
  const unitPrice = parseFloat(item.price_at_sale || item.product?.price || 0);
  const quantity = item.quantity || 1;

  let modifierTotal = 0;
  if (item.selected_modifiers_snapshot?.length > 0) {
    item.selected_modifiers_snapshot.forEach(mod => {
      const modPrice = parseFloat(mod.price_at_sale || 0);
      const modQty = mod.quantity || 1;
      modifierTotal += modPrice * modQty;
    });
  } else if (item.total_modifier_price) {
    modifierTotal = parseFloat(item.total_modifier_price);
  }

  return (unitPrice + modifierTotal) * quantity;
}

/**
 * Calculate discountable subtotal (excludes items with exclude_from_discounts=true)
 * @param {Array} items - Cart items
 * @param {Map} productTypeMap - Map of product_type_id -> product type data
 * @param {string} currency - Currency code
 * @returns {number} Discountable subtotal in minor units
 */
function calculateDiscountableSubtotal(items, productTypeMap, currency = 'USD') {
  const discountableItems = getDiscountableItems(items, productTypeMap);
  let subtotalMinor = 0;

  discountableItems.forEach(item => {
    const itemTotal = getItemTotal(item);
    subtotalMinor += toMinor(itemTotal, currency);
  });

  return subtotalMinor;
}

// ============================================================================
// DISCOUNT STRATEGIES
// Mirrors backend/discounts/strategies.py
// ============================================================================

/**
 * ORDER + PERCENTAGE discount strategy
 * Mirrors OrderPercentageDiscountStrategy
 */
function calculateOrderPercentageDiscount(discount, items, subtotalMinor, productTypeMap, currency) {
  // Check minimum purchase amount
  const minPurchase = parseFloat(discount.min_purchase_amount || 0);
  if (minPurchase > 0) {
    const subtotal = fromMinor(subtotalMinor, currency);
    if (subtotal < minPurchase) return 0;
  }

  // Calculate discountable subtotal (excludes items with exclude_from_discounts=true)
  const discountableSubtotalMinor = calculateDiscountableSubtotal(items, productTypeMap, currency);

  // Apply percentage (value is stored as 0-100, e.g., 15 for 15%)
  const discountRate = parseFloat(discount.value) / 100;
  const discountAmountMinor = Math.round(discountableSubtotalMinor * discountRate);

  return discountAmountMinor;
}

/**
 * ORDER + FIXED_AMOUNT discount strategy
 * Mirrors OrderFixedAmountDiscountStrategy
 */
function calculateOrderFixedDiscount(discount, items, subtotalMinor, productTypeMap, currency) {
  // Check minimum purchase amount
  const minPurchase = parseFloat(discount.min_purchase_amount || 0);
  if (minPurchase > 0) {
    const subtotal = fromMinor(subtotalMinor, currency);
    if (subtotal < minPurchase) return 0;
  }

  // Calculate discountable subtotal
  const discountableSubtotalMinor = calculateDiscountableSubtotal(items, productTypeMap, currency);

  // Fixed amount capped to discountable subtotal (can't discount more than order total)
  const discountValueMinor = toMinor(parseFloat(discount.value), currency);
  const discountAmountMinor = Math.min(discountableSubtotalMinor, discountValueMinor);

  return discountAmountMinor;
}

/**
 * PRODUCT + PERCENTAGE discount strategy
 * Mirrors ProductPercentageDiscountStrategy
 */
function calculateProductPercentageDiscount(discount, items, subtotalMinor, productTypeMap, currency) {
  // Check minimum purchase amount
  const minPurchase = parseFloat(discount.min_purchase_amount || 0);
  if (minPurchase > 0) {
    const subtotal = fromMinor(subtotalMinor, currency);
    if (subtotal < minPurchase) return 0;
  }

  // Get applicable product IDs
  const applicableProductIds = new Set(discount.applicable_product_ids || []);
  if (applicableProductIds.size === 0) return 0;

  const discountRate = parseFloat(discount.value) / 100;
  let discountAmountMinor = 0;

  items.forEach(item => {
    const productId = item.product?.id;
    if (!productId || !applicableProductIds.has(productId)) return;

    // Skip items excluded from discounts
    if (isItemExcludedFromDiscounts(item, productTypeMap)) return;

    const itemTotal = getItemTotal(item);
    const itemTotalMinor = toMinor(itemTotal, currency);
    const itemDiscountMinor = Math.round(itemTotalMinor * discountRate);
    discountAmountMinor += itemDiscountMinor;
  });

  return discountAmountMinor;
}

/**
 * PRODUCT + FIXED_AMOUNT discount strategy
 * Mirrors ProductFixedAmountDiscountStrategy
 */
function calculateProductFixedDiscount(discount, items, subtotalMinor, productTypeMap, currency) {
  // Check minimum purchase amount
  const minPurchase = parseFloat(discount.min_purchase_amount || 0);
  if (minPurchase > 0) {
    const subtotal = fromMinor(subtotalMinor, currency);
    if (subtotal < minPurchase) return 0;
  }

  // Get applicable product IDs
  const applicableProductIds = new Set(discount.applicable_product_ids || []);
  if (applicableProductIds.size === 0) return 0;

  const discountValueMinor = toMinor(parseFloat(discount.value), currency);
  let discountAmountMinor = 0;

  items.forEach(item => {
    const productId = item.product?.id;
    if (!productId || !applicableProductIds.has(productId)) return;

    // Skip items excluded from discounts
    if (isItemExcludedFromDiscounts(item, productTypeMap)) return;

    const itemTotal = getItemTotal(item);
    const itemTotalMinor = toMinor(itemTotal, currency);
    // Cap discount to item total
    const itemDiscountMinor = Math.min(itemTotalMinor, discountValueMinor);
    discountAmountMinor += itemDiscountMinor;
  });

  return discountAmountMinor;
}

/**
 * CATEGORY + PERCENTAGE discount strategy
 * Mirrors CategoryPercentageDiscountStrategy
 */
function calculateCategoryPercentageDiscount(discount, items, subtotalMinor, productTypeMap, currency) {
  // Check minimum purchase amount
  const minPurchase = parseFloat(discount.min_purchase_amount || 0);
  if (minPurchase > 0) {
    const subtotal = fromMinor(subtotalMinor, currency);
    if (subtotal < minPurchase) return 0;
  }

  // Get applicable category IDs
  const applicableCategoryIds = new Set(discount.applicable_category_ids || []);
  if (applicableCategoryIds.size === 0) return 0;

  const discountRate = parseFloat(discount.value) / 100;
  let discountAmountMinor = 0;

  items.forEach(item => {
    const categoryId = item.product?.category_id;
    if (!categoryId || !applicableCategoryIds.has(categoryId)) return;

    // Skip items excluded from discounts
    if (isItemExcludedFromDiscounts(item, productTypeMap)) return;

    const itemTotal = getItemTotal(item);
    const itemTotalMinor = toMinor(itemTotal, currency);
    const itemDiscountMinor = Math.round(itemTotalMinor * discountRate);
    discountAmountMinor += itemDiscountMinor;
  });

  return discountAmountMinor;
}

/**
 * CATEGORY + FIXED_AMOUNT discount strategy
 * Mirrors CategoryFixedAmountDiscountStrategy
 */
function calculateCategoryFixedDiscount(discount, items, subtotalMinor, productTypeMap, currency) {
  // Check minimum purchase amount
  const minPurchase = parseFloat(discount.min_purchase_amount || 0);
  if (minPurchase > 0) {
    const subtotal = fromMinor(subtotalMinor, currency);
    if (subtotal < minPurchase) return 0;
  }

  // Get applicable category IDs
  const applicableCategoryIds = new Set(discount.applicable_category_ids || []);
  if (applicableCategoryIds.size === 0) return 0;

  const discountValueMinor = toMinor(parseFloat(discount.value), currency);
  let discountAmountMinor = 0;

  items.forEach(item => {
    const categoryId = item.product?.category_id;
    if (!categoryId || !applicableCategoryIds.has(categoryId)) return;

    // Skip items excluded from discounts
    if (isItemExcludedFromDiscounts(item, productTypeMap)) return;

    const itemTotal = getItemTotal(item);
    const itemTotalMinor = toMinor(itemTotal, currency);
    // Cap discount to item total
    const itemDiscountMinor = Math.min(itemTotalMinor, discountValueMinor);
    discountAmountMinor += itemDiscountMinor;
  });

  return discountAmountMinor;
}

/**
 * BUY_X_GET_Y (BOGO) discount strategy
 * Mirrors BuyXGetYDiscountStrategy
 *
 * Algorithm:
 * 1. Collect all eligible items (matching applicable_products, not excluded)
 * 2. Flatten by quantity (item qty=3 @ $10 becomes [$10, $10, $10])
 * 3. Sort by price ascending (cheapest first)
 * 4. Calculate groups: total_items / (buy_qty + get_qty)
 * 5. Free items = groups * get_qty
 * 6. Discount = sum of cheapest N items (the free ones)
 */
function calculateBuyXGetYDiscount(discount, items, subtotalMinor, productTypeMap, currency) {
  const buyQuantity = parseInt(discount.buy_quantity) || 0;
  const getQuantity = parseInt(discount.get_quantity) || 0;

  if (buyQuantity <= 0 || getQuantity <= 0) return 0;

  // Get applicable product IDs
  const applicableProductIds = new Set(discount.applicable_product_ids || []);
  if (applicableProductIds.size === 0) return 0;

  // Collect eligible items, flattened by quantity
  const eligibleItemPrices = [];

  items.forEach(item => {
    const productId = item.product?.id;
    if (!productId || !applicableProductIds.has(productId)) return;

    // Skip items excluded from discounts
    if (isItemExcludedFromDiscounts(item, productTypeMap)) return;

    const quantity = item.quantity || 1;
    const unitPrice = parseFloat(item.price_at_sale || item.product?.price || 0);

    // Add modifier price per unit
    let modifierPerUnit = 0;
    if (item.selected_modifiers_snapshot?.length > 0) {
      item.selected_modifiers_snapshot.forEach(mod => {
        const modPrice = parseFloat(mod.price_at_sale || 0);
        const modQty = mod.quantity || 1;
        modifierPerUnit += modPrice * modQty;
      });
    } else if (item.total_modifier_price) {
      modifierPerUnit = parseFloat(item.total_modifier_price) / quantity;
    }

    const pricePerUnit = unitPrice + modifierPerUnit;

    // Flatten: add one entry per quantity
    for (let i = 0; i < quantity; i++) {
      eligibleItemPrices.push(pricePerUnit);
    }
  });

  const totalItems = eligibleItemPrices.length;
  const groupSize = buyQuantity + getQuantity;

  // Calculate number of complete groups
  const numGroups = Math.floor(totalItems / groupSize);
  if (numGroups === 0) return 0;

  // Number of items to discount (the "free" items)
  const numItemsToDiscount = numGroups * getQuantity;

  // Sort by price ascending (cheapest first get discounted)
  eligibleItemPrices.sort((a, b) => a - b);

  // Sum the cheapest N items (they're free)
  let discountAmount = 0;
  for (let i = 0; i < numItemsToDiscount; i++) {
    discountAmount += eligibleItemPrices[i];
  }

  return toMinor(discountAmount, currency);
}

// ============================================================================
// STRATEGY FACTORY
// Mirrors backend/discounts/factories.py
// ============================================================================

/**
 * Get the appropriate discount calculation function based on type and scope
 * @param {string} type - Discount type
 * @param {string} scope - Discount scope
 * @returns {Function|null} Calculation function or null if invalid combination
 */
function getDiscountStrategy(type, scope) {
  const strategies = {
    [`${DiscountScope.ORDER}_${DiscountType.PERCENTAGE}`]: calculateOrderPercentageDiscount,
    [`${DiscountScope.ORDER}_${DiscountType.FIXED_AMOUNT}`]: calculateOrderFixedDiscount,
    [`${DiscountScope.PRODUCT}_${DiscountType.PERCENTAGE}`]: calculateProductPercentageDiscount,
    [`${DiscountScope.PRODUCT}_${DiscountType.FIXED_AMOUNT}`]: calculateProductFixedDiscount,
    [`${DiscountScope.CATEGORY}_${DiscountType.PERCENTAGE}`]: calculateCategoryPercentageDiscount,
    [`${DiscountScope.CATEGORY}_${DiscountType.FIXED_AMOUNT}`]: calculateCategoryFixedDiscount,
    [`${DiscountScope.PRODUCT}_${DiscountType.BUY_X_GET_Y}`]: calculateBuyXGetYDiscount,
  };

  return strategies[`${scope}_${type}`] || null;
}

/**
 * Calculate discount amount for a single discount
 *
 * @param {Object} discount - Discount object with type, scope, value, etc.
 * @param {Array} items - Cart items
 * @param {number} subtotalMinor - Order subtotal in minor units
 * @param {Map} productTypeMap - Product type lookup map
 * @param {string} currency - Currency code
 * @returns {number} Discount amount in minor units
 */
export function calculateDiscountAmount(discount, items, subtotalMinor, productTypeMap, currency = 'USD') {
  // Check if discount is active
  if (!isDiscountActive(discount)) return 0;

  const strategy = getDiscountStrategy(discount.type, discount.scope);
  if (!strategy) {
    console.warn(`Unknown discount strategy: ${discount.scope}_${discount.type}`);
    return 0;
  }

  return strategy(discount, items, subtotalMinor, productTypeMap, currency);
}

/**
 * Calculate total discounts for all applied predefined discounts
 *
 * @param {Array} appliedDiscounts - Array of applied discount entries.
 *   Can be either:
 *   - Direct discount objects: { id, type, scope, value, ... }
 *   - Applied discount wrappers: { id, discount: { type, scope, value, ... }, amount }
 * @param {Array} items - Cart items
 * @param {number} subtotalMinor - Order subtotal in minor units
 * @param {Map} productTypeMap - Product type lookup map
 * @param {string} currency - Currency code
 * @returns {Object} { totalMinor: number, breakdown: Array<{discount, amountMinor}> }
 */
export function calculateAllDiscounts(appliedDiscounts, items, subtotalMinor, productTypeMap, currency = 'USD') {
  const breakdown = [];
  let totalMinor = 0;

  appliedDiscounts.forEach(entry => {
    // Handle both formats: direct discount object OR wrapper with nested discount
    // Backend sends: { id, discount: { ... }, amount }
    // Direct would be: { id, type, scope, value, ... }
    const discount = entry.discount || entry;

    const amountMinor = calculateDiscountAmount(discount, items, subtotalMinor, productTypeMap, currency);
    if (amountMinor > 0) {
      breakdown.push({
        discount,
        amountMinor,
        amount: fromMinor(amountMinor, currency),
      });
      totalMinor += amountMinor;
    }
  });

  return {
    totalMinor,
    total: fromMinor(totalMinor, currency),
    breakdown,
  };
}

/**
 * Validate if a discount code can be applied
 *
 * @param {Object} discount - Discount object
 * @param {Array} items - Cart items
 * @param {number} subtotal - Order subtotal in decimal
 * @param {Array} existingDiscounts - Already applied discounts
 * @param {boolean} allowStacking - Whether discount stacking is allowed
 * @returns {Object} { valid: boolean, reason?: string }
 */
export function validateDiscountApplication(discount, items, subtotal, existingDiscounts = [], allowStacking = true) {
  // Check if active
  if (!isDiscountActive(discount)) {
    return { valid: false, reason: 'Discount is not currently active' };
  }

  // Check minimum purchase
  const minPurchase = parseFloat(discount.min_purchase_amount || 0);
  if (minPurchase > 0 && subtotal < minPurchase) {
    return {
      valid: false,
      reason: `Minimum purchase of $${minPurchase.toFixed(2)} required`,
    };
  }

  // Check stacking
  if (!allowStacking && existingDiscounts.length > 0) {
    return { valid: false, reason: 'Only one discount can be applied at a time' };
  }

  // Check if already applied
  if (existingDiscounts.some(d => d.id === discount.id)) {
    return { valid: false, reason: 'This discount is already applied' };
  }

  // For BOGO, check if enough qualifying items
  if (discount.type === DiscountType.BUY_X_GET_Y) {
    const buyQty = parseInt(discount.buy_quantity) || 0;
    const getQty = parseInt(discount.get_quantity) || 0;
    const requiredQty = buyQty + getQty;

    const applicableProductIds = new Set(discount.applicable_product_ids || []);
    let eligibleCount = 0;

    items.forEach(item => {
      if (applicableProductIds.has(item.product?.id)) {
        eligibleCount += item.quantity || 1;
      }
    });

    if (eligibleCount < requiredQty) {
      return {
        valid: false,
        reason: `Need ${requiredQty} qualifying items (have ${eligibleCount})`,
      };
    }
  }

  return { valid: true };
}

/**
 * Find applicable discounts from available discounts based on cart contents
 *
 * @param {Array} availableDiscounts - All available discounts from cache
 * @param {Array} items - Cart items
 * @param {number} subtotal - Order subtotal in decimal
 * @returns {Array} Discounts that could apply to this cart
 */
export function findApplicableDiscounts(availableDiscounts, items, subtotal) {
  const productIds = new Set(items.map(item => item.product?.id).filter(Boolean));
  const categoryIds = new Set(items.map(item => item.product?.category_id).filter(Boolean));

  return availableDiscounts.filter(discount => {
    // Must be active
    if (!isDiscountActive(discount)) return false;

    // Check minimum purchase
    const minPurchase = parseFloat(discount.min_purchase_amount || 0);
    if (minPurchase > 0 && subtotal < minPurchase) return false;

    // Check scope-specific applicability
    switch (discount.scope) {
      case DiscountScope.ORDER:
        return true; // Order-level discounts always potentially apply

      case DiscountScope.PRODUCT: {
        const applicableProducts = discount.applicable_product_ids || [];
        return applicableProducts.some(id => productIds.has(id));
      }

      case DiscountScope.CATEGORY: {
        const applicableCategories = discount.applicable_category_ids || [];
        return applicableCategories.some(id => categoryIds.has(id));
      }

      default:
        return false;
    }
  });
}

// Export for testing
export const _strategies = {
  calculateOrderPercentageDiscount,
  calculateOrderFixedDiscount,
  calculateProductPercentageDiscount,
  calculateProductFixedDiscount,
  calculateCategoryPercentageDiscount,
  calculateCategoryFixedDiscount,
  calculateBuyXGetYDiscount,
  getDiscountStrategy,
  isItemExcludedFromDiscounts,
  getDiscountableItems,
  calculateDiscountableSubtotal,
};
