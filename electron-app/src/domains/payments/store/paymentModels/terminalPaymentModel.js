import StripeTerminalService from "@/shared/lib/stripeTerminalService";
import useTerminalStore from "@/domains/pos/store/terminalStore";
import apiClient from "@/shared/lib/apiClient";
import {
	captureTerminalIntent,
	cancelTerminalIntent,
} from "@/domains/payments/services/paymentService";

export const terminalPaymentModel = {
	process: async (context) => {
		const { orderId, balanceDue, tipAmount } = context;
		const terminalStore = useTerminalStore.getState();
		const baseAmount = balanceDue - (tipAmount || 0);
		let paymentIntentId = null;

		try {
			if (!terminalStore.connectedReader) {
				throw new Error("Terminal not connected.");
			}

			const intentResponse = await apiClient.post(
				`/payments/orders/${orderId}/create-terminal-intent/`,
				{ amount: baseAmount, tip: tipAmount || 0 }
			);
			const paymentIntent = intentResponse.data;
			paymentIntentId = paymentIntent.payment_intent_id;

			if (context.setPaymentIntentId) {
				context.setPaymentIntentId(paymentIntentId);
			}
			// Step 2: Collect payment on the physical terminal
			await StripeTerminalService.collectPayment(paymentIntent.client_secret);

			// --- THIS IS THE FIX ---
			// Step 3: Tell our backend to capture, now passing BOTH the orderId and paymentIntentId.
			console.log(
				"Terminal collection successful. Capturing intent:",
				paymentIntent.payment_intent_id
			);
			const finalPaymentState = await captureTerminalIntent(
				orderId,
				paymentIntent.payment_intent_id
			);

			return { success: true, data: finalPaymentState };
		} catch (error) {
			return {
				success: false,
				error: error.message || "An unknown terminal error occurred.",
			};
		}
	},

	/**
	 * Cancels a specific payment intent on the backend.
	 * This is a discrete task, perfect for the model.
	 */
	cancel: async (paymentIntentId) => {
		if (!paymentIntentId) {
			console.warn("No paymentIntentId provided to cancel.");
			return;
		}
		try {
			await cancelTerminalIntent(paymentIntentId);
		} catch (error) {
			console.error("Error cancelling payment intent:", error);
			throw new Error("Failed to cancel the previous payment.");
		}
	},
};
