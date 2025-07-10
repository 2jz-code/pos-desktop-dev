import apiClient from "@/shared/lib/apiClient";

export const giftCardService = {
	/**
	 * Validate a gift card code and return balance information
	 * @param {string} code - The gift card code to validate
	 * @returns {Promise<Object>} Gift card validation response
	 */
	async validateGiftCard(code) {
		try {
			const response = await apiClient.post("/payments/gift-cards/validate/", {
				code: code.trim().toUpperCase(),
			});
			return {
				success: true,
				data: response.data,
			};
		} catch (error) {
			return {
				success: false,
				error: error.response?.data?.error || "Failed to validate gift card",
				data: error.response?.data || null,
			};
		}
	},

	/**
	 * Process a gift card payment
	 * @param {Object} paymentData - Payment data including order_id, gift_card_code, amount
	 * @returns {Promise<Object>} Payment processing response
	 */
	async processGiftCardPayment(paymentData) {
		try {
			const response = await apiClient.post("/payments/gift-cards/payment/", {
				order_id: paymentData.orderId,
				gift_card_code: paymentData.gift_card_code,
				amount: paymentData.amount,
			});
			return {
				success: true,
				data: response.data,
			};
		} catch (error) {
			return {
				success: false,
				error:
					error.response?.data?.error || "Failed to process gift card payment",
				data: error.response?.data || null,
			};
		}
	},

	/**
	 * Get list of gift cards (admin only)
	 * @returns {Promise<Object>} List of gift cards
	 */
	async getGiftCards() {
		try {
			const response = await apiClient.get("/payments/gift-cards/");
			return {
				success: true,
				data: response.data,
			};
		} catch (error) {
			return {
				success: false,
				error: error.response?.data?.error || "Failed to fetch gift cards",
				data: null,
			};
		}
	},
};
