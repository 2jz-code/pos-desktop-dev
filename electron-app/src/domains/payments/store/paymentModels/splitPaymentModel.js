// src/store/slices/paymentModels/splitPaymentModel.js
import { cashPaymentModel } from "@/domains/payments/store/paymentModels/cashPaymentModel";
import { terminalPaymentModel } from "@/domains/payments/store/paymentModels/terminalPaymentModel";

/**
 * @description
 * This model acts as a "delegator" or "meta-conductor" for split payments.
 * It does not contain any payment processing logic itself. Instead, its sole
 * responsibility is to delegate the processing of a partial payment to the
 * appropriate, specialized payment model (cash or terminal).
 *
 * This pattern keeps our specialized models clean and focused on a single task,
 * while allowing us to orchestrate more complex flows like split payments.
 */
export const splitPaymentModel = {
	/**
	 * Processes a partial payment by delegating to the correct payment model.
	 * @param {object} context - The payment context.
	 * @param {'CASH' | 'CARD'} context.method - The payment method for this split.
	 * @param {number} context.orderId - The ID of the order being paid.
	 * @param {number} context.splitAmount - The amount of this specific partial payment.
	 * @param {number} [context.tipAmount] - Optional tip amount for this split.
	 * @returns {Promise<{success: boolean, data?: any, error?: string}>} The result from the delegated model.
	 */
	process: async (context) => {
		const { method, orderId, splitAmount, tipAmount } = context;

		switch (method) {
			case "CASH":
				// For a cash payment, we tell the cash model to process an amount
				// equal to the current split amount.
				return await cashPaymentModel.process({
					orderId,
					amount: splitAmount,
				});

			case "CARD":
				// For a card payment, we tell the terminal model to process a payment
				// where the balanceDue is considered to be the current split amount.
				return await terminalPaymentModel.process({
					orderId,
					balanceDue: splitAmount, // The model sees the split amount as the total due for this transaction
					tipAmount,
					// Pass down the setPaymentIntentId function if it exists in the context
					setPaymentIntentId: context.setPaymentIntentId,
				});

			default:
				// Handle cases where an unsupported payment method is provided.
				console.error(`Unsupported split payment method: ${method}`);
				return {
					success: false,
					error: `Unsupported split payment method: ${method}`,
				};
		}
	},
};
