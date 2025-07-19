import { cashPaymentModel } from "@/domains/payments/store/paymentModels/cashPaymentModel";
import { terminalPaymentModel } from "@/domains/payments/store/paymentModels/terminalPaymentModel";
import {
	cancelTerminalIntent,
	refundTransaction,
	getPaymentById,
	calculateSurcharge,
} from "@/domains/payments/services/paymentService";
import useTerminalStore from "@/domains/pos/store/terminalStore";
import { openCashDrawer } from "@/shared/lib/hardware";
import { useSettingsStore } from "@/domains/settings/store/settingsStore";

export const createPaymentSlice = (set, get) => ({
	// CORE DIALOG STATE
	order: null,
	lastCompletedOrder: null,
	isTenderDialogOpen: false,

	selectedPayment: null, // To hold data for the details view
	isLoadingDetails: false,
	error: null,

	// "STATE MACHINE" CONTEXT
	tenderState: "idle",
	paymentMethod: null, // ADDED
	balanceDue: 0,
	tipAmount: 0,
	paymentHistory: [],
	changeDue: 0,
	orderId: null,
	currentPaymentIntentId: null,
	partialAmount: 0,

	// UI ACTIONS
	startTender: (fullOrderObject) => {
		// Calculate balance due from order's payment details if available
		const grandTotal = parseFloat(fullOrderObject.grand_total) || 0;
		const amountPaid = parseFloat(fullOrderObject.payment_details?.amount_paid) || 0;
		const calculatedBalanceDue = grandTotal - amountPaid;
		
		// Get existing payment history from order if available
		const existingPaymentHistory = fullOrderObject.payment_details?.transactions || [];
		
		set({
			order: fullOrderObject,
			lastCompletedOrder: null,
			isTenderDialogOpen: true,
			tenderState: "awaitingPaymentMethod",
			paymentMethod: null, // RESET
			balanceDue: calculatedBalanceDue,
			orderId: fullOrderObject.id,
			tipAmount: 0,
			paymentHistory: existingPaymentHistory,
			changeDue: 0,
			error: null,
			currentPaymentIntentId: null,
			partialAmount: 0,
			surchargeAmount: 0, // Reset surcharge when starting new tender
		});
	},

	closeTender: () => {
		const intentIdToCancel = get().currentPaymentIntentId;
		if (intentIdToCancel) {
			cancelTerminalIntent(intentIdToCancel);
		}
		// Only close the dialog, don't reset payment state
		// Payment state should persist across dialog opens/closes
		set({
			isTenderDialogOpen: false,
			tenderState: "awaitingPaymentMethod", // Reset to initial payment state for next open
			paymentMethod: null, // Reset method selection for next open
			currentPaymentIntentId: null,
			partialAmount: 0,
			surchargeAmount: 0,
			error: null, // Clear any errors when closing
		});
		// Keep: order, balanceDue, paymentHistory, changeDue, orderId, tipAmount, lastCompletedOrder
	},

	// Complete reset for new orders - use this when starting fresh
	resetTender: () => {
		const intentIdToCancel = get().currentPaymentIntentId;
		if (intentIdToCancel) {
			cancelTerminalIntent(intentIdToCancel);
		}
		set({
			order: null,
			lastCompletedOrder: null,
			isTenderDialogOpen: false,
			tenderState: "idle",
			paymentMethod: null,
			balanceDue: 0,
			tipAmount: 0,
			paymentHistory: [],
			changeDue: 0,
			orderId: null,
			currentPaymentIntentId: null,
			partialAmount: 0,
			surchargeAmount: 0,
			error: null,
		});
	},

	retryFailedPayment: async () => {
		console.log("Retrying failed payment...");
		try {
			// First, explicitly disconnect the reader
			const { disconnectReader } = useTerminalStore.getState();
			await disconnectReader();
		} catch (error) {
			// Log the error but continue, as the main goal is to reset the UI.
			console.error("Error during disconnect on retry:", error);
		} finally {
			// Then, reset the payment flow back to the beginning
			set({
				tenderState: "awaitingPaymentMethod",
				paymentMethod: null, // RESET
				error: null,
				partialAmount: 0,
			});
		}
	},

	// STATE TRANSITION ACTIONS
	selectPaymentMethod: async (method) => {
		set({ paymentMethod: method }); // SET

		if (method === "CASH") {
			set({ tenderState: "awaitingCashAmount" });
			return;
		}
		if (method === "GIFT_CARD") {
			set({ tenderState: "awaitingGiftCard" });
			return;
		}
		if (method === "SPLIT") {
			set({
				tenderState: "splittingPayment",
				surchargeAmount: 0, // Reset surcharge when entering split payment
			});
			return;
		}
		if (method === "CREDIT") {
			set({ tenderState: "initializingTerminal" });
			try {
				const surchargeResponse = await calculateSurcharge(get().balanceDue);
				const surchargeAmount = parseFloat(surchargeResponse.surcharge) || 0;
				set({
					surchargeAmount: surchargeAmount,
					// DO NOT add surcharge to balanceDue. It's for display only.
				});
				const { initializeTerminal } = useTerminalStore.getState();
				await initializeTerminal();
				set({ tenderState: "awaitingTip" });
			} catch (error) {
				set({ tenderState: "paymentError", error: error.message });
			}
		}
	},

	prepareToPaySplit: async (amount, method) => {
		set({ partialAmount: amount, paymentMethod: method });

		if (method === "CASH") {
			set({ tenderState: "awaitingCashAmount" });
			return;
		}

		if (method === "GIFT_CARD") {
			set({ tenderState: "awaitingGiftCard" });
			return;
		}

		if (method === "CREDIT") {
			set({ tenderState: "initializingTerminal" });
			try {
				const surchargeResponse = await calculateSurcharge(amount);
				const surchargeAmount = parseFloat(surchargeResponse.surcharge) || 0;
				set({
					surchargeAmount: surchargeAmount,
					// DO NOT modify partialAmount. It should be the base split amount.
				});
				const { initializeTerminal } = useTerminalStore.getState();
				await initializeTerminal();
				set({ tenderState: "awaitingTip" });
			} catch (error) {
				set({ tenderState: "paymentError", error: error.message });
			}
		}
	},

	goBack: () => {
		set({
			tenderState: "awaitingPaymentMethod",
			error: null,
			partialAmount: 0,
			surchargeAmount: 0, // Reset surcharge when going back
		});
	},

	// ASYNC LOGIC ACTIONS
	applyCashPayment: async (tenderedAmount) => {
		set({ tenderState: "processingPayment" });
		const state = get();
		const isSplit = state.partialAmount > 0;
		const amountToProcess = isSplit ? state.partialAmount : state.balanceDue;

		const result = await cashPaymentModel.process({
			orderId: state.orderId,
			amount: amountToProcess,
		});

		if (result.success) {
			const { data } = result;
			const newBalance = parseFloat(data.balance_due);
			const changeForThisTransaction =
				tenderedAmount >= amountToProcess
					? tenderedAmount - amountToProcess
					: 0;
			const isComplete = newBalance <= 0;

			// Open cash drawer if the order is complete and any cash payment was made
			if (isComplete) {
				// Check if there are any cash payments in the transaction history
				const hasCashPayment = data.transactions.some(transaction => 
					transaction.method === 'CASH'
				);
				
				if (hasCashPayment) {
					try {
						const settingsState = useSettingsStore.getState();
						const { printers, receiptPrinterId } = settingsState;
						const receiptPrinter = printers.find(p => p.id === receiptPrinterId);
						
						if (receiptPrinter) {
							await openCashDrawer(receiptPrinter);
						} else {
							console.warn("No receipt printer configured for cash drawer opening");
						}
					} catch (error) {
						console.error("Failed to open cash drawer:", error);
						// Don't fail the payment if cash drawer fails to open
					}
				}
			}

			set({
				lastCompletedOrder: isComplete ? state.order : null,
				balanceDue: newBalance,
				paymentHistory: data.transactions,
				changeDue: state.changeDue + changeForThisTransaction,
				tenderState: isComplete ? "complete" : "splittingPayment",
				partialAmount: 0,
				surchargeAmount: 0, // Reset surcharge when returning to split payment
			});
		} else {
			set({ tenderState: "paymentError", error: result.error });
		}
	},

	applyTipAndProcessTerminalPayment: async (tipAmount) => {
		if (get().tenderState !== "awaitingTip") return;

		set({
			tenderState: "processingPayment",
			tipAmount: tipAmount,
		});

		const state = get();
		const isSplit = state.partialAmount > 0;
		const baseAmountToProcess = isSplit
			? state.partialAmount
			: state.balanceDue;

		const context = {
			orderId: state.orderId,
			balanceDue: baseAmountToProcess,
			tipAmount: state.tipAmount,
			surchargeAmount: state.surchargeAmount,
			setPaymentIntentId: (id) => set({ currentPaymentIntentId: id }),
		};

		const result = await terminalPaymentModel.process(context);

		if (result.success) {
			const { data } = result;
			const newBalance = parseFloat(data.balance_due);
			const isComplete = newBalance <= 0;

			// Open cash drawer if the order is complete and any cash payment was made
			if (isComplete) {
				// Check if there are any cash payments in the transaction history
				const hasCashPayment = data.transactions.some(transaction => 
					transaction.method === 'CASH'
				);
				
				if (hasCashPayment) {
					try {
						const settingsState = useSettingsStore.getState();
						const { printers, receiptPrinterId } = settingsState;
						const receiptPrinter = printers.find(p => p.id === receiptPrinterId);
						
						if (receiptPrinter) {
							await openCashDrawer(receiptPrinter);
						} else {
							console.warn("No receipt printer configured for cash drawer opening");
						}
					} catch (error) {
						console.error("Failed to open cash drawer:", error);
						// Don't fail the payment if cash drawer fails to open
					}
				}
			}

			set({
				lastCompletedOrder: isComplete ? get().order : null,
				balanceDue: newBalance,
				paymentHistory: data.transactions,
				tenderState: isComplete ? "complete" : "splittingPayment",
				currentPaymentIntentId: null,
				partialAmount: 0,
				tipAmount: 0,
				surchargeAmount: 0, // Reset surcharge when returning to split payment
			});
		} else {
			set({
				tenderState: "paymentError",
				error: result.error,
				currentPaymentIntentId:
					result.paymentIntentId || get().currentPaymentIntentId,
			});
		}
	},

	applyGiftCardPayment: async (giftCardData) => {
		set({ tenderState: "processingPayment" });
		const state = get();

		try {
			// Use the gift card service which properly handles API base URL
			const { giftCardService } = await import(
				"../../payments/services/giftCardService"
			);

			const result = await giftCardService.processGiftCardPayment({
				orderId: state.orderId,
				gift_card_code: giftCardData.gift_card_code,
				amount: giftCardData.amount,
			});

			if (!result.success) {
				throw new Error(result.error || "Gift card payment failed");
			}

			const data = result.data;
			const newBalance = parseFloat(data.balance_due || 0);
			const isComplete = newBalance <= 0;

			// Open cash drawer if the order is complete and any cash payment was made
			if (isComplete) {
				// Check if there are any cash payments in the transaction history
				const hasCashPayment = (data.transactions || []).some(transaction => 
					transaction.method === 'CASH'
				);
				
				if (hasCashPayment) {
					try {
						const settingsState = useSettingsStore.getState();
						const { printers, receiptPrinterId } = settingsState;
						const receiptPrinter = printers.find(p => p.id === receiptPrinterId);
						
						if (receiptPrinter) {
							await openCashDrawer(receiptPrinter);
						} else {
							console.warn("No receipt printer configured for cash drawer opening");
						}
					} catch (error) {
						console.error("Failed to open cash drawer:", error);
						// Don't fail the payment if cash drawer fails to open
					}
				}
			}

			set({
				lastCompletedOrder: isComplete ? state.order : null,
				balanceDue: newBalance,
				paymentHistory: data.transactions || [],
				tenderState: isComplete ? "complete" : "splittingPayment",
				partialAmount: 0,
				surchargeAmount: 0, // Reset surcharge when returning to split payment
			});
		} catch (error) {
			console.error("Gift card payment error:", error);
			set({
				tenderState: "paymentError",
				error: error.message || "Gift card payment failed",
			});
		}
	},

	fetchPaymentById: async (paymentId) => {
		set({ isLoadingDetails: true, error: null });
		try {
			const payment = await getPaymentById(paymentId);
			set({ selectedPayment: payment, isLoadingDetails: false });
		} catch (err) {
			const errorMessage =
				err.response?.data?.error || "Failed to fetch payment details.";
			set({ error: errorMessage, isLoadingDetails: false });
		}
	},

	/**
	 * Processes a refund for a transaction.
	 */
	refundTransaction: async ({ paymentId, refundData }) => {
		set({ isLoadingDetails: true, error: null }); // Reuse loading state
		try {
			const updatedPayment = await refundTransaction(paymentId, refundData);
			// On success, update the selectedPayment in the store with the fresh data from the backend.
			set({ selectedPayment: updatedPayment, isLoadingDetails: false });
			return { success: true, data: updatedPayment };
		} catch (err) {
			const errorMessage =
				err.response?.data?.error || "Failed to process refund.";
			set({ error: errorMessage, isLoadingDetails: false });
			return { success: false, error: errorMessage };
		}
	},
});
