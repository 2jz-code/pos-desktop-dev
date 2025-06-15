// src/store/slices/paymentModels/cashPaymentModel.js
import apiClient from "../../../lib/apiClient";

export const cashPaymentModel = {
	process: async (context) => {
		const { orderId, amount } = context;

		if (!orderId || !amount || amount <= 0) {
			throw new Error(
				"Order ID and a valid amount are required for cash payment."
			);
		}

		try {
			const response = await apiClient.post(`/payments/process/`, {
				order_id: orderId,
				amount: parseFloat(amount),
				method: "CASH",
			});
			return { success: true, data: response.data };
		} catch (error) {
			return {
				success: false,
				error: error.message || "An unknown API error occurred.",
			};
		}
	},
};
