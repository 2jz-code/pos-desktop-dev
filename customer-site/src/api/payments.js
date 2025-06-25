import apiClient from "./client";

// Payments API service
export const paymentsAPI = {
	// Create payment intent (for Stripe)
	createPaymentIntent: async (orderData) => {
		const response = await apiClient.post(
			"/payments/create-intent/",
			orderData
		);
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

	// Get payment transactions for an order
	getOrderPayments: async (orderId) => {
		const response = await apiClient.get(`/payments/?order=${orderId}`);
		return response.data;
	},

	// Refund payment
	refundPayment: async (paymentId, refundData) => {
		const response = await apiClient.post(
			`/payments/${paymentId}/refund/`,
			refundData
		);
		return response.data;
	},

	// Get customer's payment history
	getCustomerPayments: async (customerId) => {
		const response = await apiClient.get(`/payments/?customer=${customerId}`);
		return response.data;
	},
};

export default paymentsAPI;
