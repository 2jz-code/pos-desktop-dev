import apiClient from "./client";

class InventoryService {
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
	 * @returns {Promise} API response with all stock records
	 */
	async getAllStock(filters = {}) {
		try {
			const params = new URLSearchParams();
			if (filters.location) {
				params.append("location", filters.location);
			}
			if (filters.search) {
				params.append("search", filters.search);
			}

			const response = await apiClient.get("/inventory/stock/", { params });
			return response.data;
		} catch (error) {
			console.error("Failed to get all stock:", error);
			throw error;
		}
	}

	/**
	 * Get stock levels for a specific product
	 * @param {number} productId - Product ID
	 * @returns {Promise} API response with stock records for the product
	 */
	async getStockByProduct(productId) {
		try {
			const response = await apiClient.get(
				`/inventory/stock/product/${productId}/`
			);
			return response.data;
		} catch (error) {
			console.error(`Failed to get stock for product ${productId}:`, error);
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
	 * Update a location
	 * @param {number} locationId - Location ID
	 * @param {Object} locationData - Location data {name, description}
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
	 * Adjust stock for a product
	 * @param {number} productId - Product ID
	 * @param {number} locationId - Location ID
	 * @param {number} quantity - Quantity to adjust (positive to add, negative to remove)
	 * @param {string} reason - Reason for adjustment
	 * @returns {Promise} API response
	 */
	async adjustStock(productId, locationId, quantity, reason = "") {
		try {
			const response = await apiClient.post("/inventory/stock/adjust/", {
				product_id: productId,
				location_id: locationId,
				quantity: quantity,
				reason: reason,
			});
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
	 * @param {string} reason - Reason for transfer
	 * @returns {Promise} API response
	 */
	async transferStock(
		productId,
		fromLocationId,
		toLocationId,
		quantity,
		reason = ""
	) {
		try {
			const response = await apiClient.post("/inventory/stock/transfer/", {
				product_id: productId,
				from_location_id: fromLocationId,
				to_location_id: toLocationId,
				quantity: quantity,
				reason: reason,
			});
			return response.data;
		} catch (error) {
			console.error("Failed to transfer stock:", error);
			throw error;
		}
	}

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
	 * Quick stock adjustment for when items are found but not in system
	 * @param {number} productId - Product ID
	 * @param {number} foundQuantity - Quantity found
	 * @param {string} reason - Reason for the adjustment
	 * @returns {Promise} API response
	 */
	async quickStockAdjustment(
		productId,
		foundQuantity,
		reason = "Found during service"
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
	 * Look up inventory stock by product barcode
	 * @param {string} barcode - Product barcode
	 * @returns {Promise} API response with stock information
	 */
	async barcodeStockLookup(barcode) {
		try {
			const response = await apiClient.get(
				`/inventory/barcode/${barcode}/stock/`
			);
			return response.data;
		} catch (error) {
			console.error(`Failed to lookup stock for barcode ${barcode}:`, error);
			throw error;
		}
	}

	/**
	 * Adjust stock by scanning barcode
	 * @param {string} barcode - Product barcode
	 * @param {number} quantity - Quantity to adjust
	 * @param {string} adjustmentType - 'add' or 'subtract'
	 * @returns {Promise} API response
	 */
	async barcodeStockAdjustment(barcode, quantity, adjustmentType = "add") {
		try {
			const response = await apiClient.post(
				`/inventory/barcode/${barcode}/adjust/`,
				{
					quantity: quantity,
					adjustment_type: adjustmentType,
				}
			);
			return response.data;
		} catch (error) {
			console.error("Failed to adjust stock by barcode:", error);
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
	 * Update a recipe
	 * @param {number} recipeId - Recipe ID
	 * @param {Object} recipeData - Recipe data {name, menu_item_id, ingredients}
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
}

export default new InventoryService();
