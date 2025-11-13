import apiClient from "./client";

/**
 * Comprehensive Modifier Service
 * Handles all modifier-related operations including:
 * - Product modifier management
 * - Global modifier sets (library)
 * - Smart suggestions and templates
 * - Usage analytics
 */

// ==========================================
// TYPE DEFINITIONS
// ==========================================

export interface ModifierOption {
	id: number;
	name: string;
	price_delta: number;
	display_order: number;
	is_product_specific?: boolean;
	modifier_set?: number;
}

export interface ModifierSet {
	id: number;
	name: string;
	internal_name: string;
	selection_type: "SINGLE" | "MULTIPLE";
	min_selections: number;
	max_selections?: number | null;
	triggered_by_option?: number | null;
	options?: ModifierOption[];
	product_count?: number;
}

export interface ProductModifierRelationship {
	id: number;
	product: number;
	modifier_set: number;
	modifier_set_id?: number;
	relationship_id?: number;
	display_order: number;
	hidden_options: number[];
}

export interface TemplateData {
	name: string;
	type: "SINGLE" | "MULTIPLE";
	min_selections?: number;
	max_selections?: number;
	options: Array<
		| string
		| {
				name: string;
				price_delta?: number;
				isProductSpecific?: boolean;
		  }
	>;
}

export interface ModifierSuggestion {
	name: string;
	type: "SINGLE" | "MULTIPLE";
	options: string[];
}

// ==========================================
// PRODUCT MODIFIER MANAGEMENT
// ==========================================

/**
 * Get all modifiers for a specific product with full relationship data
 */
export const getProductModifiers = async (
	productId: number,
	includeAll = false
): Promise<ModifierSet[]> => {
	const url = includeAll
		? `/products/${productId}/?include_all_modifiers=true`
		: `/products/${productId}/`;
	const response = await apiClient.get(url);
	return response.data.modifier_groups || [];
};

/**
 * Get product modifier relationships directly
 */
export const getProductModifierRelationships = async (
	productId: number
): Promise<ProductModifierRelationship[]> => {
	try {
		const response = await apiClient.get(
			`/products/${productId}/modifier-sets/`
		);
		
		// Handle different response structures
		let data = response.data;
		
		// If the response has a 'results' property (paginated), use that
		if (data && typeof data === 'object' && 'results' in data) {
			data = data.results;
		}
		
		// Ensure we have an array
		if (!Array.isArray(data)) {
			console.error("API response is not an array:", data);
			return [];
		}
		
		return data;
	} catch (error) {
		console.error("Error fetching product modifier relationships:", error);
		throw error;
	}
};

/**
 * Add a modifier set to a product
 */
export const addModifierSetToProduct = async (
	productId: number,
	modifierSetId: number
) => {
	// First check if the modifier set is already added to this product
	try {
		const existingRelationships = await getProductModifierRelationships(
			productId
		);
		const alreadyExists = existingRelationships.some(
			(rel) => rel.id === modifierSetId || rel.id === parseInt(modifierSetId.toString())
		);

		if (alreadyExists) {
			console.log(
				`Modifier set ${modifierSetId} is already added to product ${productId}`
			);
			// Return a success-like response since the desired state is already achieved
			return { data: { message: "Modifier set already added to product" } };
		}
	} catch (error) {
		console.warn(
			"Could not check existing relationships, proceeding with add:",
			error
		);
	}

	// Try different URL patterns
	const urlPatterns = [
		`/products/${productId}/modifier-sets/`,
		`/products/products/${productId}/modifier-sets/`,
	];

	for (const urlPattern of urlPatterns) {
		try {
			const response = await apiClient.post(urlPattern, {
				product: productId,
				modifier_set_id: modifierSetId,
				display_order: 0, // Default to 0, can be updated later
			});
			console.log(`Successfully used URL pattern: ${urlPattern}`);
			return response;
		} catch (error: any) {
			if (error.response?.status === 404) {
				console.log(`URL pattern failed: ${urlPattern}`);
				continue; // Try next pattern
			}

			// Handle the specific duplicate error more gracefully
			if (
				error.response?.status === 400 &&
				error.response?.data?.non_field_errors?.[0]?.includes(
					"must make a unique set"
				)
			) {
				console.log(
					`Modifier set ${modifierSetId} is already added to product ${productId}`
				);
				// Return a success-like response since the desired state is already achieved
				return { data: { message: "Modifier set already added to product" } };
			}

			throw error; // Other errors should be thrown
		}
	}

	throw new Error("No working URL pattern found for product modifier sets");
};

/**
 * Remove a modifier set from a product
 */
export const removeModifierSetFromProduct = async (
	productId: number,
	modifierSetId: number
) => {
	// First, get the current relationships to find the relationship ID
	const relationships = await getProductModifierRelationships(productId);

	// Debug logging
	console.log('Removing modifier set:', modifierSetId);
	console.log('Available relationships:', relationships.map(r => ({
		id: r.id,
		relationship_id: r.relationship_id,
		modifier_set: r.modifier_set,
		modifier_set_id: r.modifier_set_id
	})));

	// The modifierSetId could be either:
	// 1. The modifier_set ID (from rel.id which is sourced from modifier_set.id)
	// 2. The modifier_set_id field
	// 3. The relationship_id (if passed incorrectly)
	const relationship = relationships.find(
		(rel) =>
			rel.id === modifierSetId ||
			rel.id === parseInt(modifierSetId.toString()) ||
			rel.modifier_set === modifierSetId ||
			rel.modifier_set_id === modifierSetId ||
			rel.relationship_id === modifierSetId
	);

	if (!relationship) {
		console.error('Modifier set not found. Looking for ID:', modifierSetId);
		console.error('Available relationships:', JSON.stringify(relationships, null, 2));
		throw new Error("Modifier set relationship not found");
	}

	// Use the relationship_id for deletion
	const relationshipId = relationship.relationship_id || relationship.id;

	// Try different URL patterns for deletion
	const urlPatterns = [
		`/products/${productId}/modifier-sets/${relationshipId}/`,
		`/products/products/${productId}/modifier-sets/${relationshipId}/`,
	];

	for (const urlPattern of urlPatterns) {
		try {
			await apiClient.delete(urlPattern);
			console.log(`Successfully deleted using URL pattern: ${urlPattern}`);
			return { success: true };
		} catch (error: any) {
			if (error.response?.status === 404) {
				console.log(`Delete URL pattern failed: ${urlPattern}`);
				continue; // Try next pattern
			}
			throw error; // Other errors should be thrown
		}
	}

	throw new Error(
		"No working URL pattern found for deleting product modifier sets"
	);
};

/**
 * Update modifier sets for a product (add/remove/reorder) - DEPRECATED
 * Use addModifierSetToProduct and removeModifierSetFromProduct instead
 */
export const updateProductModifierSets = async (
	productId: number,
	modifierSetIds: number[]
) => {
	// This function is deprecated but kept for backwards compatibility
	console.warn(
		"updateProductModifierSets is deprecated. Use addModifierSetToProduct/removeModifierSetFromProduct instead."
	);

	if (modifierSetIds.length === 0) return { success: true };

	// For now, just add the last modifier set
	const latestModifierSetId = modifierSetIds[modifierSetIds.length - 1];
	return addModifierSetToProduct(productId, latestModifierSetId);
};

/**
 * Update display order of modifier sets for a product
 */
export const updateModifierOrdering = async (
	productId: number,
	modifierSetOrdering: Array<{ modifier_set_id: number; display_order: number }>
) => {
	// Get the relationships using the correct URL pattern
	const relationships = await getProductModifierRelationships(productId);

	// Update each relationship's display_order individually
	for (const orderItem of modifierSetOrdering) {
		const relationship = relationships.find(
			(rel) =>
				rel.id === orderItem.modifier_set_id || rel.id === parseInt(orderItem.modifier_set_id.toString())
		);

		if (relationship) {
			const relationshipId = relationship.relationship_id || relationship.id;
			await apiClient.patch(
				`/products/${productId}/modifier-sets/${relationshipId}/`,
				{
					display_order: orderItem.display_order,
				}
			);
		}
	}

	return { success: true };
};

/**
 * Hide/show specific options for a product's modifier set
 */
export const updateHiddenOptions = async (
	productId: number,
	modifierSetId: number,
	hiddenOptionIds: number[]
) => {
	// Get the relationship object first using the correct URL pattern
	const relationships = await getProductModifierRelationships(productId);

	const relationship = relationships.find((rel) => {
		// Convert both to strings for comparison to handle type mismatches
		return String(rel.id) === String(modifierSetId);
	});

	if (relationship) {
		const relationshipId = relationship.relationship_id || relationship.id;
		const response = await apiClient.patch(
			`/products/${productId}/modifier-sets/${relationshipId}/`,
			{
				hidden_options: hiddenOptionIds,
			}
		);
		return response;
	}

	throw new Error("Product modifier set relationship not found");
};

/**
 * Add product-specific modifier option to a modifier set
 * @param {string|number} productId - The product ID
 * @param {string|number} modifierSetId - The modifier set ID
 * @param {Object} optionData - Option data including name, price_delta, display_order
 */
export const addProductSpecificOption = async (
	productId: number,
	modifierSetId: number,
	optionData: {
		name: string;
		price_delta: number;
		display_order: number;
	}
) => {
	// First, find the ProductModifierSet relationship
	const relationships = await getProductModifierRelationships(productId);
	const relationship = relationships.find(
		(rel) => rel.id === modifierSetId || rel.id === parseInt(modifierSetId.toString())
	);

	if (!relationship) {
		console.error('Available relationships:', relationships.map(r => ({
			id: r.id,
			modifier_set: r.modifier_set,
			modifier_set_id: r.modifier_set_id
		})));
		throw new Error(`Product modifier set relationship not found for modifierSetId: ${modifierSetId}`);
	}

	// Use the proper endpoint for adding product-specific options
	const relationshipId = (relationship as any).relationship_id || relationship.id;
	const urlPatterns = [
		`/products/${productId}/modifier-sets/${relationshipId}/add-product-specific-option/`,
		`/products/products/${productId}/modifier-sets/${relationshipId}/add-product-specific-option/`,
	];

	for (const urlPattern of urlPatterns) {
		try {
			const response = await apiClient.post(urlPattern, optionData);
			return response.data;
		} catch (error: any) {
			if (error.response?.status === 404) {
				continue; // Try next pattern
			}
			throw error; // Other errors should be thrown
		}
	}

	throw new Error(
		"No working URL pattern found for adding product-specific options"
	);
};

/**
 * Remove product-specific modifier option
 * @param {string|number} productId - The product ID
 * @param {string|number} modifierSetId - The modifier set ID
 * @param {string|number} optionId - The option ID to remove
 */
export const removeProductSpecificOption = async (
	productId: number,
	modifierSetId: number,
	optionId: number
) => {
	// First, find the ProductModifierSet relationship
	const relationships = await getProductModifierRelationships(productId);
	const relationship = relationships.find(
		(rel) => rel.id === modifierSetId || rel.id === parseInt(modifierSetId.toString())
	);

	if (!relationship) {
		console.error('Available relationships:', relationships.map(r => ({
			id: r.id,
			modifier_set: r.modifier_set,
			modifier_set_id: r.modifier_set_id
		})));
		throw new Error(`Product modifier set relationship not found for modifierSetId: ${modifierSetId}`);
	}

	// Use the proper endpoint for removing product-specific options
	const relationshipId = (relationship as any).relationship_id || relationship.id;
	const urlPatterns = [
		`/products/${productId}/modifier-sets/${relationshipId}/remove-product-specific-option/${optionId}/`,
		`/products/products/${productId}/modifier-sets/${relationshipId}/remove-product-specific-option/${optionId}/`,
	];

	for (const urlPattern of urlPatterns) {
		try {
			const response = await apiClient.delete(urlPattern);
			return response.data;
		} catch (error: any) {
			if (error.response?.status === 404) {
				continue; // Try next pattern
			}
			throw error; // Other errors should be thrown
		}
	}

	throw new Error(
		"No working URL pattern found for removing product-specific options"
	);
};

// ==========================================
// GLOBAL MODIFIER SETS (LIBRARY)
// ==========================================

/**
 * Get all modifier sets with optional filters
 */
export const getModifierSets = (params?: Record<string, string>) => {
	return apiClient.get("/products/modifier-sets/", { params });
};

/**
 * Get a specific modifier set with all options
 */
export const getModifierSet = (modifierSetId: number) => {
	return apiClient.get(`/products/modifier-sets/${modifierSetId}/`);
};

/**
 * Create a new modifier set
 */
export const createModifierSet = (modifierSetData: Partial<ModifierSet>) => {
	return apiClient.post("/products/modifier-sets/", modifierSetData);
};

/**
 * Update an existing modifier set
 */
export const updateModifierSet = (
	modifierSetId: number,
	modifierSetData: Partial<ModifierSet>
) => {
	return apiClient.patch(
		`/products/modifier-sets/${modifierSetId}/`,
		modifierSetData
	);
};

/**
 * Delete a modifier set
 */
export const deleteModifierSet = (modifierSetId: number) => {
	return apiClient.delete(`/products/modifier-sets/${modifierSetId}/`);
};

// ==========================================
// MODIFIER OPTIONS MANAGEMENT
// ==========================================

/**
 * Add option to modifier set
 * @param {string|number} modifierSetId - The modifier set ID
 * @param {Object} optionData - Option data including name, price_delta, display_order, and optionally is_product_specific
 */
export const addModifierOption = (
	modifierSetId: number,
	optionData: Partial<ModifierOption>
) => {
	return apiClient.post("/products/modifier-options/", {
		...optionData,
		modifier_set: modifierSetId,
		is_product_specific: optionData.is_product_specific ?? false,
	});
};

/**
 * Update modifier option
 */
export const updateModifierOption = (
	modifierSetId: number,
	optionId: number,
	optionData: Partial<ModifierOption>
) => {
	return apiClient.patch(`/products/modifier-options/${optionId}/`, optionData);
};

/**
 * Delete modifier option
 */
export const deleteModifierOption = (
	modifierSetId: number,
	optionId: number
) => {
	return apiClient.delete(`/products/modifier-options/${optionId}/`);
};

/**
 * Reorder options within a modifier set
 */
export const reorderModifierOptions = (
	modifierSetId: number,
	optionOrdering: Array<{ id: number; display_order: number }>
) => {
	// Note: This endpoint might not exist yet in backend
	return apiClient.patch(
		`/products/modifier-sets/${modifierSetId}/reorder-options/`,
		{
			ordering: optionOrdering,
		}
	);
};

/**
 * Update option display order for a modifier set within a product context
 * @param {number} productId - The product ID
 * @param {number} modifierSetId - The modifier set ID
 * @param {Array} ordering - Array of objects with option_id and display_order
 */
export const updateOptionOrdering = async (
	productId: number,
	modifierSetId: number,
	ordering: Array<{ option_id: number; display_order: number }>
) => {
	// First, find the ProductModifierSet relationship
	const relationships = await getProductModifierRelationships(productId);
	
	// Add debugging info
	console.log('Relationships:', relationships);
	console.log('Looking for modifierSetId:', modifierSetId);
	
	if (!Array.isArray(relationships)) {
		console.error('Relationships is not an array:', relationships);
		throw new Error("Invalid relationships data structure");
	}
	
	const relationship = relationships.find(
		(rel) => rel.id === modifierSetId || rel.id === parseInt(modifierSetId.toString())
	);

	if (!relationship) {
		console.error('Available relationships:', relationships.map(r => ({
			id: r.id,
			modifier_set: r.modifier_set,
			modifier_set_id: r.modifier_set_id
		})));
		throw new Error(`Product modifier set relationship not found for modifierSetId: ${modifierSetId}`);
	}

	// Use the proper endpoint for reordering options with product context
	const relationshipId = (relationship as any).relationship_id || relationship.id;
	const urlPatterns = [
		`/products/${productId}/modifier-sets/${relationshipId}/reorder-options/`,
		`/products/products/${productId}/modifier-sets/${relationshipId}/reorder-options/`,
	];

	for (const urlPattern of urlPatterns) {
		try {
			const response = await apiClient.patch(urlPattern, { ordering });
			return response.data;
		} catch (error: any) {
			if (error.response?.status === 404) {
				continue; // Try next pattern
			}
			throw error; // Other errors should be thrown
		}
	}

	throw new Error("No working URL pattern found for reordering options");
};

/**
 * Update all options for a modifier set (handles create/update/delete)
 * This function provides compatibility with ModifierSetEditor expectations
 */
export const updateModifierOptions = async (
	modifierSetId: number,
	options: Array<{
		id?: string | number;
		name: string;
		price_delta: number;
		display_order: number;
		is_product_specific?: boolean;
	}>
) => {
	try {
		// First get the current modifier set to see existing options
		const modifierSetResponse = await getModifierSet(modifierSetId);
		const existingOptions = modifierSetResponse.data.options || [];
		
		// Map of existing options by ID for quick lookup
		const existingOptionsMap = new Map(
			existingOptions.map((opt: ModifierOption) => [opt.id, opt])
		);

		// Track which existing options we've seen (to delete ones not in the new list)
		const seenOptionIds = new Set<number>();

		// Process each option in the new list
		for (const option of options) {
			if (option.id && existingOptionsMap.has(Number(option.id))) {
				// Update existing option
				await updateModifierOption(modifierSetId, Number(option.id), {
					name: option.name,
					price_delta: option.price_delta,
					display_order: option.display_order,
					is_product_specific: option.is_product_specific ?? false,
				});
				seenOptionIds.add(Number(option.id));
			} else {
				// Create new option
				const newOptionResponse = await addModifierOption(modifierSetId, {
					name: option.name,
					price_delta: option.price_delta,
					display_order: option.display_order,
					is_product_specific: option.is_product_specific ?? false,
				});
				if (newOptionResponse.data?.id) {
					seenOptionIds.add(newOptionResponse.data.id);
				}
			}
		}

		// Delete options that are no longer in the new list
		for (const existingOption of existingOptions) {
			if (!seenOptionIds.has(existingOption.id)) {
				await deleteModifierOption(modifierSetId, existingOption.id);
			}
		}

		return { success: true };
	} catch (error) {
		console.error("Error updating modifier options:", error);
		throw error;
	}
};

// ==========================================
// SMART SUGGESTIONS & TEMPLATES
// ==========================================

/**
 * Get modifier suggestions based on product category
 */
export const getModifierSuggestions = async (params: {
	category_name?: string;
	category_id?: string;
}): Promise<{ data: ModifierSuggestion[] }> => {
	// This endpoint doesn't exist yet, so return fallback suggestions
	const categoryName = params.category_name || params.category_id;
	return { data: getFallbackSuggestions(categoryName) };
};

/**
 * Get fallback suggestions when API is unavailable
 */
export const getFallbackSuggestions = (
	categoryName?: string
): ModifierSuggestion[] => {
	const CATEGORY_DEFAULTS: Record<string, ModifierSuggestion[]> = {
		burgers: [
			{
				name: "Size Options",
				type: "SINGLE",
				options: ["Small", "Medium", "Large"],
			},
			{
				name: "Add-ons",
				type: "MULTIPLE",
				options: ["Extra Cheese", "Bacon", "Avocado"],
			},
			{
				name: "Cooking Style",
				type: "SINGLE",
				options: ["Rare", "Medium", "Well Done"],
			},
		],
		beverages: [
			{
				name: "Size Options",
				type: "SINGLE",
				options: ["Small", "Medium", "Large"],
			},
			{ name: "Temperature", type: "SINGLE", options: ["Hot", "Cold", "Iced"] },
			{
				name: "Sweetness Level",
				type: "SINGLE",
				options: ["No Sugar", "Light", "Regular", "Extra Sweet"],
			},
		],
		pizza: [
			{
				name: "Size Options",
				type: "SINGLE",
				options: ["Personal", "Medium", "Large", "Extra Large"],
			},
			{
				name: "Crust Type",
				type: "SINGLE",
				options: ["Thin", "Regular", "Thick"],
			},
			{
				name: "Toppings",
				type: "MULTIPLE",
				options: ["Pepperoni", "Mushrooms", "Peppers", "Olives"],
			},
		],
	};

	return CATEGORY_DEFAULTS[categoryName?.toLowerCase() || ""] || [];
};

/**
 * Create modifier set from template
 */
export const createModifierFromTemplate = async (
	templateData: TemplateData
): Promise<ModifierSet> => {
	try {
		// Create the modifier set
		const modifierSetResponse = await createModifierSet({
			name: templateData.name,
			internal_name: templateData.name.toLowerCase().replace(/\s+/g, "-"),
			selection_type: templateData.type,
			min_selections:
				templateData.min_selections !== undefined
					? templateData.min_selections
					: templateData.type === "SINGLE"
					? 1
					: 0,
			max_selections:
				templateData.max_selections !== undefined
					? templateData.max_selections
					: templateData.type === "SINGLE"
					? 1
					: null,
		});

		const modifierSet = modifierSetResponse.data;

		// Add only NON-product-specific options to the modifier set
		for (let i = 0; i < templateData.options.length; i++) {
			const option = templateData.options[i];

			// Skip product-specific options in this function - they should be handled separately
			if (option.isProductSpecific) {
				console.log(`Skipping product-specific option: ${option.name}`);
				continue;
			}

			const optionData = {
				name: option.name || option, // Handle both new object format and legacy string format
				price_delta: option.price_delta || 0.00,
				display_order: i,
				is_product_specific: false,
			};

			// Create the option as a regular modifier option
			await addModifierOption(modifierSet.id, optionData);
		}

		return modifierSet;
	} catch (error) {
		console.error("Error creating modifier from template:", error);
		throw error;
	}
};

/**
 * Create modifier set from template with product-specific options
 * @param {Object} templateData - Template data including options with isProductSpecific flags
 * @param {string|number} productId - The product ID to add product-specific options to
 */
export const createModifierFromTemplateWithProductSpecific = async (
	templateData: TemplateData,
	productId: number
): Promise<ModifierSet> => {
	try {
		// Create the modifier set first with only non-product-specific options
		const modifierSet = await createModifierFromTemplate({
			name: templateData.name,
			type: templateData.type,
			options: templateData.options.filter(opt => !opt.isProductSpecific),
		});

		// Add the modifier set to the product
		await addModifierSetToProduct(productId, modifierSet.id);

		// Add product-specific options with correct display order
		const productSpecificOptions = templateData.options.filter(opt => opt.isProductSpecific);
		for (let i = 0; i < productSpecificOptions.length; i++) {
			const option = productSpecificOptions[i];

			// Find the original index of this option in the template to maintain order
			const originalIndex = templateData.options.findIndex(opt => opt === option);

			await addProductSpecificOption(productId, modifierSet.id, {
				name: option.name,
				price_delta: option.price_delta || 0.00,
				display_order: originalIndex,
			});
		}

		return modifierSet;
	} catch (error) {
		console.error(
			"Error creating modifier from template with product-specific options:",
			error
		);
		throw error;
	}
};

/**
 * Copy modifiers from another product
 */
export const copyModifiersFromProduct = (
	sourceProductId: number,
	targetProductId: number
) => {
	return apiClient.post(`/products/${targetProductId}/copy-modifiers/`, {
		source_product_id: sourceProductId,
	});
};

// ==========================================
// USAGE ANALYTICS
// ==========================================

/**
 * Get modifier set usage analytics
 */
export const getModifierSetUsage = (modifierSetId: number) => {
	return apiClient.get(`/products/modifier-sets/${modifierSetId}/usage/`);
};

/**
 * Get products using a specific modifier set
 */
export const getProductsUsingModifierSet = (modifierSetId: number) => {
	return apiClient.get(`/products/modifier-sets/${modifierSetId}/products/`);
};

/**
 * Get modifier sets that are safe to delete (not used by any products)
 */
export const getSafeToDeleteModifierSets = () => {
	return apiClient.get("/products/modifier-sets/safe-to-delete/");
};

/**
 * Get modifier usage analytics (alias for getModifierSetUsage)
 */
export const getModifierUsageAnalytics = (modifierSetId: number) => {
	return getModifierSetUsage(modifierSetId);
};

/**
 * Get products using a modifier (alias for getProductsUsingModifierSet)
 */
export const getProductsUsingModifier = (modifierSetId: number) => {
	return getProductsUsingModifierSet(modifierSetId);
};

// ==========================================
// BULK OPERATIONS
// ==========================================

/**
 * Apply modifier set to all products in a category
 */
export const applyToCategory = (modifierSetId: number, categoryId: number) => {
	return apiClient.post(
		`/products/modifier-sets/${modifierSetId}/apply-to-category/`,
		{
			category_id: categoryId,
		}
	);
};

/**
 * Replace modifier set across multiple products
 */
export const replaceModifierSet = (
	oldModifierSetId: number,
	newModifierSetId: number,
	productIds: number[] | null = null
) => {
	return apiClient.post("/products/modifier-sets/replace/", {
		old_modifier_set_id: oldModifierSetId,
		new_modifier_set_id: newModifierSetId,
		product_ids: productIds,
	});
};

// ==========================================
// CONDITIONAL LOGIC
// ==========================================

/**
 * Set conditional trigger for modifier set
 */
export const setConditionalTrigger = (
	modifierSetId: number,
	triggerOptionId: number
) => {
	return apiClient.patch(`/products/modifier-sets/${modifierSetId}/`, {
		triggered_by_option: triggerOptionId,
	});
};

/**
 * Remove conditional trigger from modifier set
 */
export const removeConditionalTrigger = (modifierSetId: number) => {
	return apiClient.patch(`/products/modifier-sets/${modifierSetId}/`, {
		triggered_by_option: null,
	});
};
