import apiClient from "@/shared/lib/apiClient";

/**
 * Calculate refund amount for a single item or multiple items (preview only).
 * @param {Object} data - { order_item_id, quantity, reason } OR { items: [{order_item_id, quantity}], reason }
 * @returns {Promise<Object>} Refund calculation result
 */
export const calculateItemRefund = async (data) => {
	try {
		// The backend endpoint handles both single and multiple items
		const response = await apiClient.post("/refunds/calculate-item/", data);
		return response.data;
	} catch (error) {
		console.error("Error calculating item refund:", error);
		throw error;
	}
};

/**
 * Process a refund for one or more items.
 * @param {Object} data - { items: [{order_item_id, quantity}], reason, transaction_id? }
 * @returns {Promise<Object>} Refund result
 */
export const processItemRefund = async (data) => {
	try {
		const response = await apiClient.post("/refunds/process-item/", data);
		return response.data;
	} catch (error) {
		console.error("Error processing item refund:", error);
		throw error;
	}
};

/**
 * Get list of refund items with optional filtering.
 * @param {Object} filters - Optional filter parameters
 * @returns {Promise<Object>} Paginated refund items
 */
export const getRefundItems = async (filters = {}) => {
	try {
		const cleanFilters = Object.entries(filters).reduce((acc, [key, value]) => {
			if (value) {
				acc[key] = value;
			}
			return acc;
		}, {});

		const params = new URLSearchParams(cleanFilters).toString();
		const response = await apiClient.get(`/refunds/items/?${params}`);
		return response.data;
	} catch (error) {
		console.error("Error fetching refund items:", error);
		throw error;
	}
};

/**
 * Get a single refund item by ID.
 * @param {string} refundItemId - The refund item ID
 * @returns {Promise<Object>} Refund item details
 */
export const getRefundItemById = async (refundItemId) => {
	try {
		const response = await apiClient.get(`/refunds/items/${refundItemId}/`);
		return response.data;
	} catch (error) {
		console.error(`Error fetching refund item ${refundItemId}:`, error);
		throw error;
	}
};
