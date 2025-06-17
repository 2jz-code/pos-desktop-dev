import { cashPaymentModel } from "./paymentModels/cashPaymentModel";
import { terminalPaymentModel } from "./paymentModels/terminalPaymentModel";
import { cancelTerminalIntent } from "@/api/services/paymentService";
import useTerminalStore from "../terminalStore";

export const createPaymentSlice = (set, get) => ({
	// CORE DIALOG STATE
	order: null,
	lastCompletedOrder: null,
	isTenderDialogOpen: false,

	// "STATE MACHINE" CONTEXT
	tenderState: "idle",
	balanceDue: 0,
	tipAmount: 0,
	paymentHistory: [],
	changeDue: 0,
	error: null,
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
			const { initializeTerminal } = useTerminalStore.getState();
			try {
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
			const { initializeTerminal } = useTerminalStore.getState();
			try {
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
});
