/**
 * @fileoverview Utility functions for modifier price calculations and formatting
 */

import { ModifierUtils } from '@/types/modifiers';

/**
 * Calculate the total price for a product with selected modifiers
 * @param {number|string} basePrice - Base product price
 * @param {import('@/types/modifiers').SelectedModifier[]} selectedModifiers - Selected modifiers
 * @param {number} quantity - Product quantity
 * @returns {number}
 */
export const calculateProductTotalWithModifiers = (basePrice, selectedModifiers = [], quantity = 1) => {
	const base = parseFloat(basePrice || 0);
	const modifierDelta = ModifierUtils.calculatePriceDelta(selectedModifiers);
	return (base + modifierDelta) * quantity;
};

/**
 * Calculate modifier price impact for display
 * @param {import('@/types/modifiers').SelectedModifier[]} selectedModifiers - Selected modifiers
 * @returns {{total: number, breakdown: Array<{name: string, delta: number}>}}
 */
export const calculateModifierPriceBreakdown = (selectedModifiers = []) => {
	const breakdown = selectedModifiers.map(modifier => ({
		name: `${modifier.modifier_set_name}: ${modifier.option_name}`,
		delta: parseFloat(modifier.price_delta || 0) * modifier.quantity
	}));

	const total = breakdown.reduce((sum, item) => sum + item.delta, 0);

	return { total, breakdown };
};

/**
 * Format price for display with currency symbol
 * @param {number|string} price - Price to format
 * @param {boolean} showPositiveSign - Whether to show + for positive values
 * @returns {string}
 */
export const formatPrice = (price, showPositiveSign = false) => {
	const numPrice = parseFloat(price || 0);
	if (isNaN(numPrice)) return '$0.00';
	
	const formatted = Math.abs(numPrice).toFixed(2);
	const sign = numPrice > 0 ? (showPositiveSign ? '+' : '') : (numPrice < 0 ? '-' : '');
	
	return `${sign}$${formatted}`;
};

/**
 * Format modifier price delta for display
 * @param {string|number} priceDelta - Price delta from modifier
 * @returns {string} - Formatted string like "+$2.50", "-$1.00", or "" for zero
 */
export const formatModifierPriceDelta = (priceDelta) => {
	const delta = parseFloat(priceDelta || 0);
	if (delta === 0) return '';
	
	const sign = delta > 0 ? '+' : '-';
	return `${sign}$${Math.abs(delta).toFixed(2)}`;
};

/**
 * Calculate and format the price difference text for UI display
 * @param {number|string} basePrice - Original product price
 * @param {import('@/types/modifiers').SelectedModifier[]} selectedModifiers - Selected modifiers
 * @param {number} quantity - Product quantity
 * @returns {{originalPrice: string, newPrice: string, difference: string, hasDifference: boolean}}
 */
export const getPriceDisplayInfo = (basePrice, selectedModifiers = [], quantity = 1) => {
	const base = parseFloat(basePrice || 0);
	const totalDelta = ModifierUtils.calculatePriceDelta(selectedModifiers);
	const newPrice = (base + totalDelta) * quantity;
	
	return {
		originalPrice: formatPrice(base * quantity),
		newPrice: formatPrice(newPrice),
		difference: formatModifierPriceDelta(totalDelta * quantity),
		hasDifference: totalDelta !== 0
	};
};

/**
 * Validate if the current price calculation makes sense
 * @param {number|string} basePrice - Base price
 * @param {import('@/types/modifiers').SelectedModifier[]} selectedModifiers - Selected modifiers
 * @returns {{isValid: boolean, errors: string[]}}
 */
export const validatePriceCalculation = (basePrice, selectedModifiers = []) => {
	const errors = [];
	const base = parseFloat(basePrice || 0);
	
	if (base < 0) {
		errors.push('Base price cannot be negative');
	}
	
	const totalDelta = ModifierUtils.calculatePriceDelta(selectedModifiers);
	const finalPrice = base + totalDelta;
	
	if (finalPrice < 0) {
		errors.push('Final price cannot be negative after applying modifiers');
	}
	
	// Check for invalid modifier deltas
	selectedModifiers.forEach(modifier => {
		const delta = parseFloat(modifier.price_delta || 0);
		if (isNaN(delta)) {
			errors.push(`Invalid price delta for ${modifier.option_name}`);
		}
	});
	
	return {
		isValid: errors.length === 0,
		errors
	};
};

/**
 * Create a summary text for selected modifiers
 * @param {import('@/types/modifiers').SelectedModifier[]} selectedModifiers - Selected modifiers
 * @returns {string}
 */
export const createModifiersSummaryText = (selectedModifiers = []) => {
	if (selectedModifiers.length === 0) return '';
	
	const groups = selectedModifiers.reduce((acc, modifier) => {
		if (!acc[modifier.modifier_set_name]) {
			acc[modifier.modifier_set_name] = [];
		}
		acc[modifier.modifier_set_name].push(modifier.option_name);
		return acc;
	}, {});
	
	return Object.entries(groups)
		.map(([setName, options]) => `${setName}: ${options.join(', ')}`)
		.join(' • ');
};

/**
 * Helper to determine if modifiers should be shown prominently in UI
 * @param {import('@/types/modifiers').SelectedModifier[]} selectedModifiers - Selected modifiers
 * @returns {boolean}
 */
export const shouldHighlightModifiers = (selectedModifiers = []) => {
	// Highlight if there are any price-affecting modifiers
	return selectedModifiers.some(modifier => parseFloat(modifier.price_delta || 0) !== 0);
};

/**
 * Sort modifiers for consistent display order
 * @param {import('@/types/modifiers').SelectedModifier[]} selectedModifiers - Selected modifiers
 * @returns {import('@/types/modifiers').SelectedModifier[]}
 */
export const sortModifiersForDisplay = (selectedModifiers = []) => {
	return [...selectedModifiers].sort((a, b) => {
		// Sort by modifier set name first, then by option name
		if (a.modifier_set_name !== b.modifier_set_name) {
			return a.modifier_set_name.localeCompare(b.modifier_set_name);
		}
		return a.option_name.localeCompare(b.option_name);
	});
};

export default {
	calculateProductTotalWithModifiers,
	calculateModifierPriceBreakdown,
	formatPrice,
	formatModifierPriceDelta,
	getPriceDisplayInfo,
	validatePriceCalculation,
	createModifiersSummaryText,
	shouldHighlightModifiers,
	sortModifiersForDisplay
};