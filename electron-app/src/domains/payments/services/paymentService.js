import apiClient from "@/shared/lib/apiClient";

/**
 * Fetches all payments from the server with optional filtering.
 * @param {Object} filters - Optional filter parameters (status, method, search)
 * @returns {Promise<Object>} The response data from the API.
 */
export const getPayments = async (filters = {}) => {
	try {
		// This removes any filter properties that are empty, so we don't send them to the backend
		const cleanFilters = Object.entries(filters).reduce((acc, [key, value]) => {
			if (value) {
				acc[key] = value;
			}
			return acc;
		}, {});

		const params = new URLSearchParams(cleanFilters).toString();
		// Calls the new global /api/payments/ endpoint with filters
		const response = await apiClient.get(`/payments/?${params}`);
		return response.data;
	} catch (error) {
		console.error("Error fetching payments:", error);
		throw error;
	}
};

/**
 * Fetches a single payment by its ID.
 * @param {string} paymentId - The ID of the payment to fetch.
 * @returns {Promise<Object>} The response data from the API.
 */
export const getPaymentById = async (paymentId) => {
	try {
		// Calls the standard /api/payments/{id}/ endpoint
		const response = await apiClient.get(`/payments/${paymentId}/`);
		return response.data;
	} catch (error) {
		console.error(`Error fetching payment with ID ${paymentId}:`, error);
		throw error;
	}
};

/**
 * Initiates a refund for a specific payment.
 * @param {string} paymentId - The ID of the payment to refund.
 * @param {number} amount - The amount to refund.
 * @returns {Promise<Object>} The response data from the API.
 */
export const refundPayment = async (paymentId, amount) => {
	try {
		// Calls the custom refund action on a specific payment
		const response = await apiClient.post(`/payments/${paymentId}/refund/`, {
			amount,
		});
		return response.data;
	} catch (error) {
		console.error(`Error refunding payment with ID ${paymentId}:`, error);
		throw error;
	}
};

export const captureTerminalIntent = async (orderId, paymentIntentId) => {
	if (!orderId || !paymentIntentId) {
		throw new Error(
			"Order ID and Payment Intent ID are required to capture the payment."
		);
	}
	try {
		const response = await apiClient.post(
			`/payments/orders/${orderId}/capture-intent/`,
			{ payment_intent_id: paymentIntentId } // Add the required body
		);
		return response.data;
	} catch (error) {
		throw new Error(
			error.response?.data?.detail || "Failed to capture payment intent."
		);
	}
};

export const cancelTerminalIntent = async (paymentIntentId) => {
	if (!paymentIntentId) {
		// If there's nothing to cancel, just return successfully.
		return Promise.resolve({ message: "No active intent to cancel." });
	}
	try {
		// This calls the endpoint defined in your backend's urls.py
		const response = await apiClient.post("/payments/cancel-intent/", {
			payment_intent_id: paymentIntentId,
		});
		return response.data;
	} catch (error) {
		// It's okay if this fails (e.g., payment already processed).
		// Log the error but don't throw, so the UI can still close.
		console.error(
			"Failed to cancel payment intent, it may have already been processed:",
			error
		);
	}
};

export const refundTransaction = async (paymentId, refundData) => {
	const response = await apiClient.post(
		`/payments/${paymentId}/refund-transaction/`,
		refundData
	);
	return response.data;
};

export const calculateSurcharge = async (amount) => {
	try {
		const response = await apiClient.post("/payments/calculate-surcharge/", {
			amount,
		});
		return response.data;
	} catch (error) {
		console.error("Error calculating surcharge:", error);
		throw error;
	}
};
