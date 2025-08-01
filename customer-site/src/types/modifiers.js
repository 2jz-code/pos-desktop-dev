/**
 * @fileoverview Type definitions for product modifiers
 * These types match the backend API response structure
 */

/**
 * @typedef {Object} ModifierOption
 * @property {number} id - Unique identifier for the modifier option
 * @property {string} name - Display name of the option (e.g., "Yes", "Mild", "Large")
 * @property {string} price_delta - Price change when this option is selected (can be negative)
 * @property {number} display_order - Order for displaying options in UI
 * @property {ModifierSet[]} triggered_sets - Modifier sets that become visible when this option is selected
 * @property {boolean} is_hidden - Whether this option is hidden for this specific product
 */

/**
 * @typedef {Object} ModifierSet
 * @property {number} id - Unique identifier for the modifier set
 * @property {string} name - Display name (e.g., "Size", "Spice Level")
 * @property {string} internal_name - Internal reference name (e.g., "size", "spice-level")
 * @property {"SINGLE"|"MULTIPLE"} selection_type - Whether customer can select one or multiple options
 * @property {number} min_selections - Minimum number of options that must be selected
 * @property {number} max_selections - Maximum number of options that can be selected
 * @property {ModifierOption[]} options - Available options in this modifier set
 */

/**
 * @typedef {Object} SelectedModifier
 * @property {number} modifier_set_id - ID of the modifier set
 * @property {number} modifier_set_name - Name of the modifier set (for display)
 * @property {number} option_id - ID of the selected option
 * @property {string} option_name - Name of the selected option (for display)
 * @property {number} quantity - Quantity of this modifier (usually 1)
 * @property {string} price_delta - Price change for this selection
 */

/**
 * @typedef {Object} ModifierSelectionState
 * @property {Object.<number, number[]>} selections - Map of modifier_set_id to array of selected option_ids
 * @property {ModifierSet[]} visibleSets - Currently visible modifier sets (including triggered ones)
 * @property {SelectedModifier[]} selectedModifiers - Array of all selected modifiers for API submission
 * @property {number} totalPriceDelta - Total price change from all selected modifiers
 * @property {string[]} validationErrors - Array of validation error messages
 * @property {boolean} isValid - Whether current selection passes all validation rules
 */

/**
 * @typedef {Object} ProductWithModifiers
 * @property {number} id - Product ID
 * @property {string} name - Product name
 * @property {string} description - Product description
 * @property {string} price - Base product price
 * @property {ModifierSet[]} modifier_groups - Available modifier sets for this product
 * @property {boolean} hasModifiers - Computed: whether this product has any modifier groups
 * @property {boolean} hasRequiredModifiers - Computed: whether this product has required modifiers
 */

/**
 * @typedef {Object} CartItemWithModifiers
 * @property {number} id - Cart item ID
 * @property {ProductWithModifiers} product - Product information
 * @property {number} quantity - Quantity of this item
 * @property {string} price_at_sale - Price when added to cart
 * @property {string} notes - Any special notes
 * @property {SelectedModifier[]} selected_modifiers_snapshot - Snapshot of selected modifiers
 * @property {number} line_total - Total price for this line item including modifiers
 */

/**
 * Modifier selection validation rules
 */
export const MODIFIER_VALIDATION = {
	/** @type {"SINGLE"} */
	SINGLE: "SINGLE",
	/** @type {"MULTIPLE"} */
	MULTIPLE: "MULTIPLE",
};

/**
 * Utility functions for working with modifiers
 */
export const ModifierUtils = {
	/**
	 * Check if a product has any modifier groups
	 * @param {ProductWithModifiers} product 
	 * @returns {boolean}
	 */
	hasModifiers: (product) => {
		return product.modifier_groups && product.modifier_groups.length > 0;
	},

	/**
	 * Check if a product has any required modifier groups
	 * @param {ProductWithModifiers} product 
	 * @returns {boolean}
	 */
	hasRequiredModifiers: (product) => {
		return product.modifier_groups?.some(set => set.min_selections > 0) || false;
	},

	/**
	 * Calculate total price delta from selected modifiers
	 * @param {SelectedModifier[]} selectedModifiers 
	 * @returns {number}
	 */
	calculatePriceDelta: (selectedModifiers) => {
		return selectedModifiers.reduce((total, modifier) => {
			const delta = parseFloat(modifier.price_delta || 0);
			return total + (delta * modifier.quantity);
		}, 0);
	},

	/**
	 * Get all visible modifier sets including triggered ones
	 * @param {ModifierSet[]} allSets 
	 * @param {Object.<number, number[]>} selections 
	 * @returns {ModifierSet[]}
	 */
	getVisibleSets: (allSets, selections) => {
		const visible = [...allSets];
		const triggered = new Set();

		// Find all triggered sets from current selections
		Object.entries(selections).forEach(([setId, optionIds]) => {
			const set = allSets.find(s => s.id === parseInt(setId));
			if (!set) return;

			optionIds.forEach(optionId => {
				const option = set.options.find(o => o.id === optionId);
				if (option?.triggered_sets) {
					option.triggered_sets.forEach(triggeredSet => {
						if (!triggered.has(triggeredSet.id)) {
							triggered.add(triggeredSet.id);
							visible.push(triggeredSet);
						}
					});
				}
			});
		});

		return visible;
	},

	/**
	 * Validate modifier selections against rules
	 * @param {ModifierSet[]} modifierSets 
	 * @param {Object.<number, number[]>} selections 
	 * @returns {{isValid: boolean, errors: string[]}}
	 */
	validateSelections: (modifierSets, selections) => {
		const errors = [];

		modifierSets.forEach(set => {
			const selectedOptions = selections[set.id] || [];
			const selectedCount = selectedOptions.length;

			// Check minimum selections
			if (selectedCount < set.min_selections) {
				errors.push(`${set.name} requires at least ${set.min_selections} selection(s)`);
			}

			// Check maximum selections
			if (set.max_selections && selectedCount > set.max_selections) {
				errors.push(`${set.name} allows at most ${set.max_selections} selection(s)`);
			}

			// Validate single selection type
			if (set.selection_type === MODIFIER_VALIDATION.SINGLE && selectedCount > 1) {
				errors.push(`${set.name} allows only one selection`);
			}
		});

		return {
			isValid: errors.length === 0,
			errors
		};
	},

	/**
	 * Convert selections to API format
	 * @param {ModifierSet[]} modifierSets 
	 * @param {Object.<number, number[]>} selections 
	 * @returns {SelectedModifier[]}
	 */
	selectionsToAPIFormat: (modifierSets, selections) => {
		const result = [];

		Object.entries(selections).forEach(([setId, optionIds]) => {
			const set = modifierSets.find(s => s.id === parseInt(setId));
			if (!set) return;

			optionIds.forEach(optionId => {
				const option = set.options.find(o => o.id === optionId);
				if (option) {
					result.push({
						modifier_set_id: set.id,
						modifier_set_name: set.name,
						option_id: option.id,
						option_name: option.name,
						quantity: 1,
						price_delta: option.price_delta
					});
				}
			});
		});

		return result;
	},

	/**
	 * Format price delta for display
	 * @param {string|number} priceDelta 
	 * @returns {string}
	 */
	formatPriceDelta: (priceDelta) => {
		const delta = parseFloat(priceDelta || 0);
		if (delta === 0) return "";
		const sign = delta > 0 ? "+" : "";
		return `${sign}$${delta.toFixed(2)}`;
	},

	/**
	 * Create initial selection state
	 * @param {ModifierSet[]} modifierSets 
	 * @returns {ModifierSelectionState}
	 */
	createInitialState: (modifierSets) => {
		return {
			selections: {},
			visibleSets: [...modifierSets],
			selectedModifiers: [],
			totalPriceDelta: 0,
			validationErrors: [],
			isValid: false
		};
	}
};

export default ModifierUtils;