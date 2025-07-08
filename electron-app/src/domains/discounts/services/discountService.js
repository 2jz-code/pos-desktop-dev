import apiClient from "@/shared/lib/apiClient";

/**
 * Fetches a list of all currently available and active discounts.
 * @returns {Promise<Object>} The response data from the API.
 */
export const getAvailableDiscounts = () => {
	return apiClient.get("/available/");
};

/**
 * Fetches a list of all discounts, with optional filtering.
 * @param {Object} params - The query parameters for filtering (e.g., { type: 'PERCENTAGE' }).
 * @returns {Promise<Object>} The response data from the API.
 */
export const getDiscounts = (params) => {
	return apiClient.get("/discounts/", { params });
};

/**
 * Creates a new discount.
 * @param {Object} data - The data for the new discount.
 * @returns {Promise<Object>} The response data from the API.
 */
export const createDiscount = (data) => {
	return apiClient.post("/discounts/", data);
};

/**
 * Updates an existing discount by its ID.
 * @param {number} discountId - The ID of the discount to update.
 * @param {Object} data - The new data for the discount.
 * @returns {Promise<Object>} The response data from the API.
 */
export const updateDiscount = (discountId, data) => {
	return apiClient.patch(`/discounts/${discountId}/`, data);
};

/**
 * Deletes a discount by its ID.
 * @param {number} discountId - The ID of the discount to delete.
 * @returns {Promise<Object>} The response data from the API.
 */
export const deleteDiscount = (discountId) => {
	return apiClient.delete(`/discounts/${discountId}/`);
};

/**
 * Applies a discount code to a specific order.
 * @param {string} orderId - The ID of the current order.
 * @param {string} code - The discount code to apply.
 * @returns {Promise<Object>} The response data from the API.
 */
export const applyDiscountCode = (orderId, code) => {
	return apiClient.post("/apply-code/", { order_id: orderId, code });
};
