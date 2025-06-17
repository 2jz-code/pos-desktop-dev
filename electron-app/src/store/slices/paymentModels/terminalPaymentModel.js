import StripeTerminalService from "../../../lib/stripeTerminalService";
import useTerminalStore from "../../terminalStore";
import apiClient from "../../../lib/apiClient";
import {
	captureTerminalIntent,
	cancelTerminalIntent,
} from "../../../api/services/paymentService";

export const terminalPaymentModel = {
	process: async (context) => {
		const { orderId, balanceDue, tipAmount } = context;
		const terminalStore = useTerminalStore.getState();
		const baseAmount = balanceDue - (tipAmount || 0);
		let paymentIntentId = null; // Variable to hold the ID

		try {
			if (!terminalStore.connectedReader) {
				throw new Error("Terminal not connected.");
			}
			// Step 1: Create the Payment Intent. The response gives us the ID.
			const intentResponse = await apiClient.post(
				`/payments/orders/${orderId}/create-terminal-intent/`,
				{ amount: baseAmount, tip: tipAmount || 0 }
			);
			const paymentIntent = intentResponse.data;
			paymentIntentId = paymentIntent.payment_intent_id; // Store the ID

			// --- THIS IS THE FIX ---
			// Immediately update the Zustand store with the new ID
			// This uses a "setter" passed in the context for immediate state updates
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
			// Optionally, you can also tell the terminal service to clear its state
			// await StripeTerminalService.clearCachedCredentials();
		} catch (error) {
			console.error("Error cancelling payment intent:", error);
			// Throw the error so the conductor knows the cancellation failed
			throw new Error("Failed to cancel the previous payment.");
		}
	},
};
