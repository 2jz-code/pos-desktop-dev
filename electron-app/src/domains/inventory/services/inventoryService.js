import apiClient from "@/shared/lib/apiClient";

class InventoryService {
	/**
	 * Check stock availability for a single product
	 * @param {number} productId - Product ID to check
	 * @returns {Promise} API response with stock information
	 */
	async checkProductStock(productId) {
		try {
			const response = await apiClient.get(
				`/inventory/stock/check/${productId}/`
			);
			return response.data;
		} catch (error) {
			console.error(`Failed to check stock for product ${productId}:`, error);
			throw error;
		}
	}

	/**
	 * Check stock availability for multiple products
	 * @param {number[]} productIds - Array of product IDs to check
	 * @returns {Promise} API response with bulk stock information
	 */
	async checkBulkStock(productIds) {
		try {
			const response = await apiClient.post("/inventory/stock/check-bulk/", {
				product_ids: productIds,
			});
			return response.data;
		} catch (error) {
			console.error("Failed to check bulk stock:", error);
			throw error;
		}
	}

	/**
	 * Get inventory dashboard data
	 * @returns {Promise} API response with dashboard data
	 */
	async getDashboardData() {
		try {
			const response = await apiClient.get("/inventory/dashboard/");
			return response.data;
		} catch (error) {
			console.error("Failed to get inventory dashboard data:", error);
			throw error;
		}
	}

	/**
	 * Get all inventory stock levels
	 * @param {Object} filters - Optional filters {location, search, product, is_low_stock, is_expiring_soon}
	 * @returns {Promise} API response with all stock records
	 */
	async getAllStock(filters = {}) {
		try {
			const params = new URLSearchParams();
			
			// Add location filter if provided
			if (filters.location) {
				params.append('location', filters.location);
			}
			
			// Add search filter if provided
			if (filters.search) {
				params.append('search', filters.search);
			}
			
			// Add product filter if provided
			if (filters.product) {
				params.append('product', filters.product);
			}
			
			// Add status filters if provided
			if (filters.is_low_stock) {
				params.append('is_low_stock', filters.is_low_stock);
			}
			
			if (filters.is_expiring_soon) {
				params.append('is_expiring_soon', filters.is_expiring_soon);
			}
			
			const queryString = params.toString();
			const url = queryString ? `/inventory/stock/?${queryString}` : "/inventory/stock/";
			
			const response = await apiClient.get(url);
			return response.data;
		} catch (error) {
			console.error("Failed to get all stock:", error);
			throw error;
		}
	}

	/**
	 * Get stock levels for a specific product across all locations
	 * @param {number} productId - Product ID to get stock for
	 * @returns {Promise} API response with stock records for the specific product
	 */
	async getStockByProduct(productId) {
		try {
			const response = await apiClient.get(`/inventory/stock/product/${productId}/`);
			return response.data;
		} catch (error) {
			console.error(`Failed to get stock for product ${productId}:`, error);
			throw error;
		}
	}

	/**
	 * Adjust stock for a product
	 * @param {number} productId - Product ID
	 * @param {number} locationId - Location ID
	 * @param {number} quantity - Quantity to adjust (positive to add, negative to remove)
	 * @param {string} expirationDate - Optional expiration date (YYYY-MM-DD)
	 * @param {number} lowStockThreshold - Optional low stock threshold
	 * @param {number} expirationThreshold - Optional expiration warning threshold in days
	 * @returns {Promise} API response
	 */
	async adjustStock(productId, locationId, quantity, expirationDate = null, lowStockThreshold = null, expirationThreshold = null) {
		try {
			const payload = {
				product_id: productId,
				location_id: locationId,
				quantity: quantity,
			};

			// Add optional fields if provided
			if (expirationDate) {
				payload.expiration_date = expirationDate;
			}
			if (lowStockThreshold !== null && lowStockThreshold !== undefined) {
				payload.low_stock_threshold = lowStockThreshold;
			}
			if (expirationThreshold !== null && expirationThreshold !== undefined) {
				payload.expiration_threshold = expirationThreshold;
			}

			const response = await apiClient.post("/inventory/stock/adjust/", payload);
			return response.data;
		} catch (error) {
			console.error("Failed to adjust stock:", error);
			throw error;
		}
	}

	/**
	 * Transfer stock between locations
	 * @param {number} productId - Product ID
	 * @param {number} fromLocationId - Source location ID
	 * @param {number} toLocationId - Destination location ID
	 * @param {number} quantity - Quantity to transfer
	 * @returns {Promise} API response
	 */
	async transferStock(productId, fromLocationId, toLocationId, quantity) {
		try {
			const response = await apiClient.post("/inventory/stock/transfer/", {
				product_id: productId,
				from_location_id: fromLocationId,
				to_location_id: toLocationId,
				quantity: quantity,
			});
			return response.data;
		} catch (error) {
			console.error("Failed to transfer stock:", error);
			throw error;
		}
	}

	/**
	 * Get all locations
	 * @returns {Promise} API response with locations
	 */
	async getLocations() {
		try {
			const response = await apiClient.get("/inventory/locations/");
			return response.data;
		} catch (error) {
			console.error("Failed to get locations:", error);
			throw error;
		}
	}

	/**
	 * Create a new location
	 * @param {Object} locationData - Location data {name, description}
	 * @returns {Promise} API response
	 */
	async createLocation(locationData) {
		try {
			const response = await apiClient.post(
				"/inventory/locations/",
				locationData
			);
			return response.data;
		} catch (error) {
			console.error("Failed to create location:", error);
			throw error;
		}
	}

	/**
	 * Quick stock adjustment for when items are found but not in system
	 * @param {number} productId - Product ID
	 * @param {number} foundQuantity - Quantity found
	 * @param {string} reason - Reason for the adjustment
	 * @returns {Promise} API response
	 */
	async quickStockAdjustment(
		productId,
		foundQuantity,
		reason = "Found during sale"
	) {
		try {
			const response = await apiClient.post("/inventory/stock/quick-adjust/", {
				product_id: productId,
				quantity: foundQuantity,
				reason: reason,
				adjustment_type: "FOUND_STOCK",
			});
			return response.data;
		} catch (error) {
			console.error("Failed to perform quick stock adjustment:", error);
			throw error;
		}
	}

	/**
	 * Update an existing location
	 * @param {number} locationId - Location ID to update
	 * @param {Object} locationData - Updated location data {name, description}
	 * @returns {Promise} API response
	 */
	async updateLocation(locationId, locationData) {
		try {
			const response = await apiClient.put(
				`/inventory/locations/${locationId}/`,
				locationData
			);
			return response.data;
		} catch (error) {
			console.error("Failed to update location:", error);
			throw error;
		}
	}

	/**
	 * Delete a location
	 * @param {number} locationId - Location ID to delete
	 * @returns {Promise} API response
	 */
	async deleteLocation(locationId) {
		try {
			const response = await apiClient.delete(
				`/inventory/locations/${locationId}/`
			);
			return response.data;
		} catch (error) {
			console.error("Failed to delete location:", error);
			throw error;
		}
	}

	/**
	 * Get all recipes
	 * @returns {Promise} API response with recipes
	 */
	async getRecipes() {
		try {
			const response = await apiClient.get("/inventory/recipes/");
			return response.data;
		} catch (error) {
			console.error("Failed to get recipes:", error);
			throw error;
		}
	}

	/**
	 * Create a new recipe
	 * @param {Object} recipeData - Recipe data {name, menu_item_id, ingredients}
	 * @returns {Promise} API response
	 */
	async createRecipe(recipeData) {
		try {
			const response = await apiClient.post("/inventory/recipes/", recipeData);
			return response.data;
		} catch (error) {
			console.error("Failed to create recipe:", error);
			throw error;
		}
	}

	/**
	 * Update an existing recipe
	 * @param {number} recipeId - Recipe ID to update
	 * @param {Object} recipeData - Updated recipe data
	 * @returns {Promise} API response
	 */
	async updateRecipe(recipeId, recipeData) {
		try {
			const response = await apiClient.put(
				`/inventory/recipes/${recipeId}/`,
				recipeData
			);
			return response.data;
		} catch (error) {
			console.error("Failed to update recipe:", error);
			throw error;
		}
	}

	/**
	 * Delete a recipe
	 * @param {number} recipeId - Recipe ID to delete
	 * @returns {Promise} API response
	 */
	async deleteRecipe(recipeId) {
		try {
			const response = await apiClient.delete(
				`/inventory/recipes/${recipeId}/`
			);
			return response.data;
		} catch (error) {
			console.error("Failed to delete recipe:", error);
			throw error;
		}
	}

	/**
	 * Get global inventory default settings
	 * @returns {Promise} API response with default thresholds
	 */
	async getInventoryDefaults() {
		try {
			const response = await apiClient.get("/inventory/defaults/");
			return response.data;
		} catch (error) {
			console.error("Failed to get inventory defaults:", error);
			throw error;
		}
	}
}

const inventoryService = new InventoryService();

// Export the service instance as default
export default inventoryService;

// Export individual methods for easier imports
export const getDashboardData = () => inventoryService.getDashboardData();
export const getAllStock = (filters) => inventoryService.getAllStock(filters);
export const getStockByProduct = (productId) => inventoryService.getStockByProduct(productId);
export const getLocations = () => inventoryService.getLocations();
export const createLocation = (locationData) => inventoryService.createLocation(locationData);
export const updateLocation = (locationId, locationData) => inventoryService.updateLocation(locationId, locationData);
export const deleteLocation = (locationId) => inventoryService.deleteLocation(locationId);
export const adjustStock = (productId, locationId, quantity, expirationDate, lowStockThreshold, expirationThreshold) => inventoryService.adjustStock(productId, locationId, quantity, expirationDate, lowStockThreshold, expirationThreshold);
export const transferStock = (productId, fromLocationId, toLocationId, quantity) => inventoryService.transferStock(productId, fromLocationId, toLocationId, quantity);
export const checkProductStock = (productId) => inventoryService.checkProductStock(productId);
export const checkBulkStock = (productIds) => inventoryService.checkBulkStock(productIds);
export const quickStockAdjustment = (productId, foundQuantity, reason) => inventoryService.quickStockAdjustment(productId, foundQuantity, reason);
export const getRecipes = () => inventoryService.getRecipes();
export const createRecipe = (recipeData) => inventoryService.createRecipe(recipeData);
export const updateRecipe = (recipeId, recipeData) => inventoryService.updateRecipe(recipeId, recipeData);
export const deleteRecipe = (recipeId) => inventoryService.deleteRecipe(recipeId);
export const getInventoryDefaults = () => inventoryService.getInventoryDefaults();
