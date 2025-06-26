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

	// Create payment intent (for Stripe) - existing method but improved
	createPaymentIntent: async (orderData) => {
		const response = await apiClient.post(
			"/payments/create-intent/",
			orderData
		);
		return response.data;
	},

	// Confirm payment intent
	confirmPaymentIntent: async (paymentIntentId, paymentMethodId) => {
		const response = await apiClient.post("/payments/confirm-intent/", {
			payment_intent_id: paymentIntentId,
			payment_method_id: paymentMethodId,
		});
		return response.data;
	},

	// Process payment
	processPayment: async (paymentData) => {
		const response = await apiClient.post("/payments/process/", paymentData);
		return response.data;
	},

	// Get payment by ID
	getPayment: async (paymentId) => {
		const response = await apiClient.get(`/payments/${paymentId}/`);
		return response.data;
	},

	// Get payment by order ID
	getPaymentByOrder: async (orderId) => {
		const response = await apiClient.get(`/payments/order/${orderId}/`);
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

	// Guest-specific payment methods
	guest: {
		// Create guest payment
		createPayment: async (orderData) => {
			const response = await apiClient.post(
				"/payments/guest/create/",
				orderData
			);
			return response.data;
		},

		// Get guest payment status
		getStatus: async (sessionKey) => {
			const response = await apiClient.get(
				`/payments/guest/status/${sessionKey}/`
			);
			return response.data;
		},
	},
};

export default paymentsAPI;
