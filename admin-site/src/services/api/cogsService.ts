import apiClient from "./client";

/**
 * COGS (Cost of Goods Sold) API Service
 *
 * Handles all API calls for:
 * - Units (global, read-only)
 * - Unit Conversions (tenant-scoped)
 * - Ingredient Configs (per-product COGS settings)
 * - Item Cost Sources (historical cost records)
 * - Menu Item COGS (theoretical cost calculations)
 */

// ============================================================================
// Types
// ============================================================================

export interface Unit {
	id: number;
	code: string;
	name: string;
	category: "weight" | "volume" | "count";
}

export interface UnitConversion {
	id: number;
	from_unit: Unit;
	to_unit: Unit;
	multiplier: string;
	product: number | null;
	product_name: string | null;
	is_active: boolean;
}

export interface IngredientConfig {
	id: number;
	product: number;
	product_name: string;
	base_unit: Unit;
	is_active: boolean;
}

export interface ItemCostSource {
	id: number;
	product: number;
	product_name: string;
	store_location: number;
	store_location_name: string;
	unit_cost: string;
	unit: Unit;
	source_type: "manual" | "default" | "invoice";
	effective_at: string;
	notes: string;
	created_by: number | null;
	created_by_name: string | null;
	created_at: string;
	updated_at: string;
	is_active: boolean;
}

export interface IngredientCostResult {
	product_id: number;
	product_name: string;
	quantity: string;
	quantity_display: string;
	unit_code: string;
	unit_display: string;
	unit_cost: string | null;
	extended_cost: string | null;
	has_cost: boolean;
	cost_type: "manual" | "computed" | "missing";
	error: string | null;
}

export interface MenuItemCostBreakdown {
	menu_item_id: number;
	menu_item_name: string;
	price: string;
	total_cost: string | null;
	margin_amount: string | null;
	margin_percent: string | null;
	ingredients: IngredientCostResult[];
	missing_products: Array<{
		product_id: number;
		product_name: string;
		reason: string;
	}>;
	is_complete: boolean;
	has_recipe: boolean;
	errors: string[];
}

export interface MenuItemCOGSSummary {
	menu_item_id: number;
	name: string;
	price: string;
	cost: string | null;
	margin_amount: string | null;
	margin_percent: string | null;
	is_cost_complete: boolean;
	has_recipe: boolean;
	has_missing_costs: boolean;
	missing_count: number;
	ingredient_count: number;
	/** 'recipe' for producible items (menu items), 'direct' for purchasable retail items */
	setup_mode: "recipe" | "direct";
}

/**
 * Ingredient data for fast setup endpoint.
 * - For existing ingredients: include ingredient_id
 * - For new ingredients: just include name (backend will match/create)
 */
export interface FastSetupIngredient {
	ingredient_id?: number;    // ID of existing product (optional)
	name: string;              // Ingredient name (for matching or creating)
	quantity: string;          // Quantity needed
	unit: string;              // Unit code (e.g., 'g', 'kg', 'oz')
	unit_cost?: string;        // Cost per unit (optional)
}

export interface FastSetupData {
	ingredients: FastSetupIngredient[];
	store_location?: number;   // Optional, can use X-Store-Location header instead
}

/**
 * Pack cost calculator input - for setting up case/pack based pricing.
 */
export interface PackCostCalculatorInput {
	product_id: number;
	store_location_id: number;
	pack_unit_id: number;
	base_unit_id: number;
	units_per_pack: string;
	pack_cost: string;
}

/**
 * Pack cost calculator response - shows what was created.
 */
export interface PackCostCalculatorResult {
	success: boolean;
	product_id: number;
	product_name: string;
	pack_unit: string;
	base_unit: string;
	pack_cost: string;
	units_per_pack: string;
	derived_base_unit_cost: string;
	details: {
		conversion: {
			id: number;
			created: boolean;
			from_unit: string;
			to_unit: string;
			multiplier: string;
		};
		pack_cost: {
			id: number;
			created: boolean;
			unit: string;
			unit_cost: string;
		};
		base_unit_cost: {
			id: number;
			created: boolean;
			unit: string;
			unit_cost: string;
		};
	};
}

// ============================================================================
// Units API (Read-only)
// ============================================================================

const getUnits = async (): Promise<Unit[]> => {
	const response = await apiClient.get("/cogs/units/");
	return response.data;
};

const getUnitsByCategory = async (category: string): Promise<Unit[]> => {
	const response = await apiClient.get("/cogs/units/", {
		params: { category },
	});
	return response.data;
};

// ============================================================================
// Unit Conversions API
// ============================================================================

const getConversions = async (productId?: number): Promise<UnitConversion[]> => {
	const response = await apiClient.get("/cogs/conversions/", {
		params: productId ? { product: productId } : {},
	});
	return response.data;
};

const createConversion = async (data: {
	from_unit: number;
	to_unit: number;
	multiplier: string;
	product?: number;
}): Promise<UnitConversion> => {
	const response = await apiClient.post("/cogs/conversions/", data);
	return response.data;
};

const updateConversion = async (
	id: number,
	data: Partial<{
		multiplier: string;
		is_active: boolean;
	}>
): Promise<UnitConversion> => {
	const response = await apiClient.patch(`/cogs/conversions/${id}/`, data);
	return response.data;
};

const deleteConversion = async (id: number): Promise<void> => {
	await apiClient.delete(`/cogs/conversions/${id}/`);
};

// ============================================================================
// Ingredient Configs API
// ============================================================================

const getIngredientConfigs = async (): Promise<IngredientConfig[]> => {
	const response = await apiClient.get("/cogs/ingredient-configs/");
	return response.data;
};

const getIngredientConfig = async (productId: number): Promise<IngredientConfig | null> => {
	try {
		const response = await apiClient.get(`/cogs/ingredient-configs/`, {
			params: { product: productId },
		});
		return response.data.length > 0 ? response.data[0] : null;
	} catch {
		return null;
	}
};

const createIngredientConfig = async (data: {
	product: number;
	base_unit: number;
}): Promise<IngredientConfig> => {
	const response = await apiClient.post("/cogs/ingredient-configs/", data);
	return response.data;
};

const updateIngredientConfig = async (
	id: number,
	data: Partial<{
		base_unit: number;
		is_active: boolean;
	}>
): Promise<IngredientConfig> => {
	const response = await apiClient.patch(`/cogs/ingredient-configs/${id}/`, data);
	return response.data;
};

// ============================================================================
// Item Cost Sources API
// ============================================================================

const getCostSources = async (params?: {
	product?: number;
	store_location?: number;
	source_type?: string;
}): Promise<ItemCostSource[]> => {
	const response = await apiClient.get("/cogs/costs/", { params });
	return response.data;
};

const getCostSource = async (id: number): Promise<ItemCostSource> => {
	const response = await apiClient.get(`/cogs/costs/${id}/`);
	return response.data;
};

const createCostSource = async (data: {
	product: number;
	store_location: number;
	unit_cost: string;
	unit: number;
	source_type?: string;
	effective_at: string;
	notes?: string;
}): Promise<ItemCostSource> => {
	const response = await apiClient.post("/cogs/costs/", data);
	return response.data;
};

const updateCostSource = async (
	id: number,
	data: Partial<{
		unit_cost: string;
		unit: number;
		source_type: string;
		effective_at: string;
		notes: string;
		is_active: boolean;
	}>
): Promise<ItemCostSource> => {
	const response = await apiClient.patch(`/cogs/costs/${id}/`, data);
	return response.data;
};

const deleteCostSource = async (id: number): Promise<void> => {
	await apiClient.delete(`/cogs/costs/${id}/`);
};

// ============================================================================
// Menu Item COGS API
// ============================================================================

export interface PaginatedResponse<T> {
	count: number;
	next: string | null;
	previous: string | null;
	results: T[];
}

const getMenuItemsCOGS = async (params?: {
	category?: number;
	has_recipe?: boolean;
	search?: string;
	page?: number;
	page_size?: number;
}): Promise<PaginatedResponse<MenuItemCOGSSummary>> => {
	const response = await apiClient.get("/cogs/menu-items/", { params });
	return response.data;
};

const getMenuItemCOGSDetail = async (menuItemId: number): Promise<MenuItemCostBreakdown> => {
	const response = await apiClient.get(`/cogs/menu-items/${menuItemId}/`);
	return response.data;
};

const fastSetupMenuItemCosts = async (
	menuItemId: number,
	data: FastSetupData
): Promise<MenuItemCostBreakdown> => {
	const response = await apiClient.post(`/cogs/menu-items/${menuItemId}/fast-setup/`, data);
	return response.data;
};

// ============================================================================
// Pack Cost Calculator API
// ============================================================================

/**
 * Calculate and save pack-based costs for an ingredient.
 * Example: "Case of 48 cans for $24" → derives $0.50 per can
 */
const calculatePackCost = async (
	data: PackCostCalculatorInput
): Promise<PackCostCalculatorResult> => {
	const response = await apiClient.post("/cogs/pack-calculator/", data);
	return response.data;
};

// ============================================================================
// Export
// ============================================================================

const cogsService = {
	// Units
	getUnits,
	getUnitsByCategory,

	// Conversions
	getConversions,
	createConversion,
	updateConversion,
	deleteConversion,

	// Ingredient Configs
	getIngredientConfigs,
	getIngredientConfig,
	createIngredientConfig,
	updateIngredientConfig,

	// Cost Sources
	getCostSources,
	getCostSource,
	createCostSource,
	updateCostSource,
	deleteCostSource,

	// Menu Item COGS
	getMenuItemsCOGS,
	getMenuItemCOGSDetail,
	fastSetupMenuItemCosts,

	// Pack Calculator
	calculatePackCost,
};

export default cogsService;
