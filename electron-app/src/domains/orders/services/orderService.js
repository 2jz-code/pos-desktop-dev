import apiClient from "@/shared/lib/apiClient";

// Renamed from getOrders to getAllOrders for clarity and updated to handle filters
export const getAllOrders = async (filters = {}, url = null) => {
	if (url) {
		// If a URL is provided (for pagination), use it directly.
		const response = await apiClient.get(url);
		return response.data;
	}

	// This removes any filter properties that are empty, so we don't send them to the backend
	const cleanFilters = Object.entries(filters).reduce((acc, [key, value]) => {
		if (value) {
			acc[key] = value;
		}
		return acc;
	}, {});

	const params = new URLSearchParams(cleanFilters).toString();
	const response = await apiClient.get(`/orders/?${params}`);
	// The viewset returns an array directly, no need for response.data.data
	return response.data;
};

export const getOrderById = async (orderId) => {
	const response = await apiClient.get(`/orders/${orderId}/`);
	// The viewset returns the object directly
	return response;
};

export const createOrder = async (orderData) => {
	const response = await apiClient.post("/orders/", orderData);
	return response;
};

export const updateOrder = async (orderId, orderData) => {
	const response = await apiClient.patch(`/orders/${orderId}/`, orderData);
	return response;
};

// Action-specific functions
export const cancelOrder = async (orderId) => {
	return apiClient.post(`/orders/${orderId}/cancel/`);
};

export const voidOrder = async (orderId) => {
	return apiClient.post(`/orders/${orderId}/void/`);
};

export const resumeOrder = async (orderId) => {
	return apiClient.post(`/orders/${orderId}/resume/`);
};

export const holdOrder = async (orderId) => {
	return apiClient.post(`/orders/${orderId}/hold/`);
};

export const resendConfirmationEmail = async (orderId) => {
	return apiClient.post(`/orders/${orderId}/resend-confirmation/`);
};

export const markSentToKitchen = async (orderId) => {
	return apiClient.post(`/orders/${orderId}/mark-sent-to-kitchen/`);
};
