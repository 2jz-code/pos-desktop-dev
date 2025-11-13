import apiClient from "./client";

/**
 * Calculate refund amount for a single item (preview only).
 * @param {Object} data - { order_item_id, quantity, reason }
 * @returns {Promise<Object>} Refund calculation result
 */
export const calculateItemRefund = async (data) => {
	try {
		const response = await apiClient.post("/refunds/calculate-item/", data);
		return response.data;
	} catch (error) {
		console.error("Error calculating item refund:", error);
		throw error;
	}
};

/**
 * Calculate refund amount for multiple items (preview only).
 * @param {Object} data - { items: [{order_item_id, quantity}], reason }
 * @returns {Promise<Object>} Refund calculation result
 */
export const calculateMultipleItemsRefund = async (data) => {
	try {
		const response = await apiClient.post("/refunds/calculate-multiple/", data);
		return response.data;
	} catch (error) {
		console.error("Error calculating multiple items refund:", error);
		throw error;
	}
};

/**
 * Process a refund for a single item.
 * @param {Object} data - { order_item_id, quantity, reason }
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
 * Process a full order refund.
 * @param {Object} data - { payment_id, reason }
 * @returns {Promise<Object>} Refund result
 */
export const processFullOrderRefund = async (data) => {
	try {
		const response = await apiClient.post("/refunds/process-full-order/", data);
		return response.data;
	} catch (error) {
		console.error("Error processing full order refund:", error);
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

/**
 * Get list of refund audit logs with optional filtering.
 * @param {Object} filters - Optional filter parameters (action, processed_by, etc.)
 * @returns {Promise<Object>} Paginated audit logs
 */
export const getRefundAuditLogs = async (filters = {}) => {
	try {
		const cleanFilters = Object.entries(filters).reduce((acc, [key, value]) => {
			if (value) {
				acc[key] = value;
			}
			return acc;
		}, {});

		const params = new URLSearchParams(cleanFilters).toString();
		const response = await apiClient.get(`/refunds/audit-logs/?${params}`);
		return response.data;
	} catch (error) {
		console.error("Error fetching refund audit logs:", error);
		throw error;
	}
};

/**
 * Get list of exchange sessions with optional filtering.
 * @param {Object} filters - Optional filter parameters
 * @returns {Promise<Object>} Paginated exchange sessions
 */
export const getExchangeSessions = async (filters = {}) => {
	try {
		const cleanFilters = Object.entries(filters).reduce((acc, [key, value]) => {
			if (value) {
				acc[key] = value;
			}
			return acc;
		}, {});

		const params = new URLSearchParams(cleanFilters).toString();
		const response = await apiClient.get(`/refunds/exchanges/?${params}`);
		return response.data;
	} catch (error) {
		console.error("Error fetching exchange sessions:", error);
		throw error;
	}
};

/**
 * Get a single exchange session by ID.
 * @param {string} sessionId - The exchange session ID
 * @returns {Promise<Object>} Exchange session details
 */
export const getExchangeSessionById = async (sessionId) => {
	try {
		const response = await apiClient.get(`/refunds/exchanges/${sessionId}/`);
		return response.data;
	} catch (error) {
		console.error(`Error fetching exchange session ${sessionId}:`, error);
		throw error;
	}
};

/**
 * Get summary of an exchange session.
 * @param {string} sessionId - The exchange session ID
 * @returns {Promise<Object>} Exchange session summary
 */
export const getExchangeSummary = async (sessionId) => {
	try {
		const response = await apiClient.get(`/refunds/exchanges/${sessionId}/summary/`);
		return response.data;
	} catch (error) {
		console.error(`Error fetching exchange summary ${sessionId}:`, error);
		throw error;
	}
};

/**
 * Calculate balance for an exchange session.
 * @param {string} sessionId - The exchange session ID
 * @returns {Promise<Object>} Balance calculation
 */
export const calculateExchangeBalance = async (sessionId) => {
	try {
		const response = await apiClient.get(`/refunds/exchanges/${sessionId}/balance/`);
		return response.data;
	} catch (error) {
		console.error(`Error calculating exchange balance ${sessionId}:`, error);
		throw error;
	}
};

/**
 * Initiate a new exchange.
 * @param {Object} data - { original_order_id, items_to_return: [{order_item_id, quantity}], reason }
 * @returns {Promise<Object>} Exchange session
 */
export const initiateExchange = async (data) => {
	try {
		const response = await apiClient.post("/refunds/exchanges/initiate/", data);
		return response.data;
	} catch (error) {
		console.error("Error initiating exchange:", error);
		throw error;
	}
};

/**
 * Create new order for exchange.
 * @param {Object} data - { exchange_session_id, new_items: [{product_id, quantity, modifiers, notes}], customer_id, order_type, store_location_id }
 * @returns {Promise<Object>} Updated exchange session
 */
export const createExchangeOrder = async (data) => {
	try {
		const response = await apiClient.post("/refunds/exchanges/create-order/", data);
		return response.data;
	} catch (error) {
		console.error("Error creating exchange order:", error);
		throw error;
	}
};

/**
 * Complete an exchange.
 * @param {Object} data - { exchange_session_id, payment_method?, payment_details? }
 * @returns {Promise<Object>} Completed exchange result
 */
export const completeExchange = async (data) => {
	try {
		const response = await apiClient.post("/refunds/exchanges/complete/", data);
		return response.data;
	} catch (error) {
		console.error("Error completing exchange:", error);
		throw error;
	}
};

/**
 * Cancel an exchange.
 * @param {Object} data - { exchange_session_id, reason }
 * @returns {Promise<Object>} Cancellation result
 */
export const cancelExchange = async (data) => {
	try {
		const response = await apiClient.post("/refunds/exchanges/cancel/", data);
		return response.data;
	} catch (error) {
		console.error("Error cancelling exchange:", error);
		throw error;
	}
};
