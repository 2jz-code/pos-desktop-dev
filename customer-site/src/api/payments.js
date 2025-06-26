import apiClient from "./client";

// Payments API service
export const paymentsAPI = {
	// Create payment intent for guest checkout
	createGuestPaymentIntent: async (orderData) => {
		const response = await apiClient.post(
			"/payments/guest/create-payment-intent/",
			orderData
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

	// Create payment intent for authenticated users
	createAuthenticatedPaymentIntent: async (orderData) => {
		const response = await apiClient.post(
			"/payments/create-payment-intent/",
			orderData
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
		// Create guest payment intent (alias for consistency)
		createPayment: async (orderData) => {
			const response = await apiClient.post(
				"/payments/guest/create-payment-intent/",
				orderData
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
		// Create payment intent for authenticated users
		createPaymentIntent: async (orderData) => {
			const response = await apiClient.post(
				"/payments/create-payment-intent/",
				orderData
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
