import { cashPaymentModel } from "@/domains/payments/store/paymentModels/cashPaymentModel";
import { terminalPaymentModel } from "@/domains/payments/store/paymentModels/terminalPaymentModel";
import {
	cancelTerminalIntent,
	refundTransaction,
	getPaymentById,
	calculateSurcharge,
} from "@/domains/payments/services/paymentService";
import useTerminalStore from "@/domains/pos/store/terminalStore";

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
	balanceDue: 0,
	tipAmount: 0,
	paymentHistory: [],
	changeDue: 0,
	orderId: null,
	currentPaymentIntentId: null,
	partialAmount: 0,

	// UI ACTIONS
	startTender: (fullOrderObject) => {
		set({
			order: fullOrderObject,
			lastCompletedOrder: null,
			isTenderDialogOpen: true,
			tenderState: "awaitingPaymentMethod",
			// --- FIX: Ensure grand_total from the API is parsed into a number ---
			balanceDue: parseFloat(fullOrderObject.grand_total) || 0,
			orderId: fullOrderObject.id,
			tipAmount: 0,
			paymentHistory: [],
			changeDue: 0,
			error: null,
			currentPaymentIntentId: null,
			partialAmount: 0,
		});
	},

	closeTender: () => {
		const intentIdToCancel = get().currentPaymentIntentId;
		if (intentIdToCancel) {
			cancelTerminalIntent(intentIdToCancel);
		}
		set({
			isTenderDialogOpen: false,
			tenderState: "idle",
			lastCompletedOrder: null,
			currentPaymentIntentId: null,
			partialAmount: 0,
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
				error: null,
				partialAmount: 0,
			});
		}
	},

	// STATE TRANSITION ACTIONS
	selectPaymentMethod: async (method) => {
		if (method === "CASH") {
			set({ tenderState: "awaitingCashAmount" });
			return;
		}
		if (method === "SPLIT") {
			set({ tenderState: "splittingPayment" });
			return;
		}
		if (method === "CREDIT") {
			set({ tenderState: "initializingTerminal" });
			try {
				const surchargeResponse = await calculateSurcharge(get().balanceDue);
				const surchargeAmount = parseFloat(surchargeResponse.surcharge) || 0;
				set({
					surchargeAmount: surchargeAmount,
					balanceDue: get().balanceDue + surchargeAmount,
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
		set({ partialAmount: amount });

		if (method === "CASH") {
			set({ tenderState: "awaitingCashAmount" });
			return;
		}

		if (method === "CREDIT") {
			set({ tenderState: "initializingTerminal" });
			try {
				const surchargeResponse = await calculateSurcharge(get().balanceDue);
				const surchargeAmount = parseFloat(surchargeResponse.surcharge) || 0;
				set({
					surchargeAmount: surchargeAmount,
					balanceDue: get().balanceDue + surchargeAmount,
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

			set({
				lastCompletedOrder: isComplete ? state.order : null,
				balanceDue: newBalance,
				paymentHistory: data.transactions,
				changeDue: state.changeDue + changeForThisTransaction,
				tenderState: isComplete ? "complete" : "splittingPayment",
				partialAmount: 0,
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
			setPaymentIntentId: (id) => set({ currentPaymentIntentId: id }),
		};

		const result = await terminalPaymentModel.process(context);

		if (result.success) {
			const { data } = result;
			const newBalance = parseFloat(data.balance_due);
			const isComplete = newBalance <= 0;

			set({
				lastCompletedOrder: isComplete ? get().order : null,
				balanceDue: newBalance,
				paymentHistory: data.transactions,
				tenderState: isComplete ? "complete" : "splittingPayment",
				currentPaymentIntentId: null,
				partialAmount: 0,
				tipAmount: 0,
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
