import apiClient from "./client";

// Payments API service
export const paymentsAPI = {
	// Calculate surcharge for a given amount
	calculateSurcharge: async (amount) => {
		const response = await apiClient.post("/payments/calculate-surcharge/", {
			amount: amount,
		});
		return response.data;
	},


	/**
	 * Create payment intent for guest checkout
	 *
	 * Supports both cart-based (web orders) and order-based (POS) flows:
	 * - For web orders: Pass cart_id (cart → order conversion happens atomically)
	 * - For POS orders: Pass order_id (order already exists)
	 *
	 * @param {object} paymentData - Payment data
	 * @param {string} paymentData.cart_id - Cart ID (for web orders)
	 * @param {string} paymentData.order_id - Order ID (for POS orders)
	 * @param {string} paymentData.amount - Amount to charge
	 * @param {string} paymentData.tip - Tip amount (optional)
	 * @param {string} paymentData.currency - Currency code (default: "usd")
	 * @param {string} paymentData.customer_email - Customer email (optional)
	 * @param {string} paymentData.customer_name - Customer name (optional)
	 */
	createGuestPaymentIntent: async (paymentData) => {
		const response = await apiClient.post(
			"/payments/guest/create-payment-intent/",
			paymentData
		);
		return response.data;
	},

	// Complete guest payment after Stripe confirmation
	completeGuestPayment: async (paymentData) => {
		const response = await apiClient.post(
			"/payments/guest/complete-payment/",
			paymentData
		);
		return response.data;
	},

	/**
	 * Create payment intent for authenticated users
	 *
	 * Supports both cart-based (web orders) and order-based (POS) flows:
	 * - For web orders: Pass cart_id (cart → order conversion happens atomically)
	 * - For POS orders: Pass order_id (order already exists)
	 *
	 * @param {object} paymentData - Payment data
	 * @param {string} paymentData.cart_id - Cart ID (for web orders)
	 * @param {string} paymentData.order_id - Order ID (for POS orders)
	 * @param {string} paymentData.amount - Amount to charge
	 * @param {string} paymentData.tip - Tip amount (optional)
	 * @param {string} paymentData.currency - Currency code (default: "usd")
	 */
	createAuthenticatedPaymentIntent: async (paymentData) => {
		const response = await apiClient.post(
			"/payments/create-payment-intent/",
			paymentData
		);
		return response.data;
	},

	// Complete authenticated payment after Stripe confirmation
	completeAuthenticatedPayment: async (paymentData) => {
		const response = await apiClient.post(
			"/payments/complete-payment/",
			paymentData
		);
		return response.data;
	},

	// Legacy create payment intent method (for backward compatibility)
	createPaymentIntent: async (orderData) => {
		const response = await apiClient.post("/payments/process/", orderData);
		return response.data;
	},

	// Confirm payment intent (generic method)
	confirmPaymentIntent: async (paymentIntentId, paymentMethodId) => {
		const response = await apiClient.post("/payments/process/", {
			payment_intent_id: paymentIntentId,
			payment_method_id: paymentMethodId,
		});
		return response.data;
	},

	// Process payment (main authenticated payment endpoint)
	processPayment: async (paymentData) => {
		const response = await apiClient.post("/payments/process/", paymentData);
		return response.data;
	},

	// Get payment by ID
	getPayment: async (paymentId) => {
		const response = await apiClient.get(`/payments/${paymentId}/`);
		return response.data;
	},

	// Get payment by order ID (using DRF lookup)
	getPaymentByOrder: async (orderId) => {
		const response = await apiClient.get(`/payments/?order=${orderId}`);
		return response.data;
	},

	// Get payment transactions for an order
	getOrderPayments: async (orderId) => {
		const response = await apiClient.get(`/payments/?order=${orderId}`);
		return response.data;
	},

	// Get customer's payment history
	getCustomerPayments: async (customerId) => {
		const response = await apiClient.get(`/payments/?customer=${customerId}`);
		return response.data;
	},

	// Cancel payment intent
	cancelPaymentIntent: async (paymentIntentId) => {
		const response = await apiClient.post("/payments/cancel-intent/", {
			payment_intent_id: paymentIntentId,
		});
		return response.data;
	},

	// Guest-specific payment methods (using correct endpoints)
	guest: {
		/**
		 * Create guest payment intent (alias for consistency)
		 *
		 * @param {object} paymentData - Payment data with cart_id or order_id
		 */
		createPayment: async (paymentData) => {
			const response = await apiClient.post(
				"/payments/guest/create-payment-intent/",
				paymentData
			);
			return response.data;
		},

		// Complete guest payment (alias for consistency)
		completePayment: async (paymentData) => {
			const response = await apiClient.post(
				"/payments/guest/complete-payment/",
				paymentData
			);
			return response.data;
		},
	},

	// Authenticated user specific methods
	authenticated: {
		/**
		 * Create payment intent for authenticated users
		 *
		 * @param {object} paymentData - Payment data with cart_id or order_id
		 */
		createPaymentIntent: async (paymentData) => {
			const response = await apiClient.post(
				"/payments/create-payment-intent/",
				paymentData
			);
			return response.data;
		},

		// Complete payment for authenticated users
		completePayment: async (paymentData) => {
			const response = await apiClient.post(
				"/payments/complete-payment/",
				paymentData
			);
			return response.data;
		},
	},
};

export default paymentsAPI;

