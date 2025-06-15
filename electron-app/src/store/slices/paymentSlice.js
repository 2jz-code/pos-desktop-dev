import { cashPaymentModel } from "./paymentModels/cashPaymentModel";
import { terminalPaymentModel } from "./paymentModels/terminalPaymentModel";
import { cancelTerminalIntent } from "@/api/services/paymentService";
import useTerminalStore from "../terminalStore"; // Import the terminal store

export const createPaymentSlice = (set, get) => ({
	// CORE DIALOG STATE
	order: null,
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

	// UI ACTIONS
	startTender: (order) => {
		set({
			order: order,
			isTenderDialogOpen: true,
			tenderState: "awaitingPaymentMethod",
			balanceDue: order.grand_total,
			orderId: order.id,
			// Reset all payment-specific state
			tipAmount: 0,
			paymentHistory: [],
			changeDue: 0,
			error: null,
			currentPaymentIntentId: null, // Ensure it's reset when a new tender starts
		});
	},

	resetPayment: () => {
		set({
			order: null,
			isTenderDialogOpen: false,
			tenderState: "idle",
			balanceDue: 0,
			tipAmount: 0,
			paymentHistory: [],
			changeDue: 0,
			error: null,
			orderId: null,
			currentPaymentIntentId: null,
		});
	},

	closeTender: () => {
		// Before closing, check if there's a pending payment to cancel
		const intentIdToCancel = get().currentPaymentIntentId;
		if (intentIdToCancel) {
			console.log(
				`Closing tender dialog, cancelling pending intent: ${intentIdToCancel}`
			);
			// Call the cancellation service but don't wait for it.
			// The user wants the dialog to close immediately.
			cancelTerminalIntent(intentIdToCancel);
		}

		set({
			isTenderDialogOpen: false,
			tenderState: "idle",
			currentPaymentIntentId: null,
		});
	},
	// STATE TRANSITION ACTIONS
	selectPaymentMethod: async (method) => {
		// For cash, the transition is immediate
		if (method === "CASH") {
			set({ tenderState: "awaitingCashAmount" });
			return;
		}

		if (method === "SPLIT") {
			set({ tenderState: "splittingPayment" });
			return;
		}

		// --- THIS IS THE NEW LOGIC FOR CARD PAYMENTS ---
		if (method === "CREDIT") {
			// 1. Immediately go into a new "initializing" state to show a loading spinner
			set({ tenderState: "initializingTerminal" });

			// 2. Get the initialize function from the terminal store
			const { initializeTerminal, isTerminalInitialized } =
				useTerminalStore.getState();

			try {
				// 3. Initialize the terminal (this fetches the fresh connection token)
				// The function is idempotent, so it's safe to call multiple times.
				if (!isTerminalInitialized) {
					await initializeTerminal();
				}

				// 4. Once initialization is successful, proceed to the 'awaitingTip' state
				set({ tenderState: "awaitingTip" });
			} catch (error) {
				// If initialization fails, go to the error state
				set({ tenderState: "paymentError", error: error.message });
			}
		}
	},

	goBack: () => {
		set({ tenderState: "awaitingPaymentMethod", error: null });
	},

	// ASYNC LOGIC ACTIONS (DELEGATION)
	applyCashPayment: async (amount) => {
		// ... (this function remains the same as before)
		set({ tenderState: "processingPayment" });
		const context = { orderId: get().orderId, amount };
		const result = await cashPaymentModel.process(context);
		if (result.success) {
			const { data } = result;
			set({
				balanceDue: data.balance_due,
				paymentHistory: [...get().paymentHistory, ...data.transactions],
				changeDue: data.change_due || 0,
				tenderState: data.balance_due <= 0 ? "complete" : "splittingPayment",
			});
		} else {
			set({ tenderState: "paymentError", error: result.error });
		}
	},

	// --- NEW: This action is called by the tip listener ---
	applyTipAndProcessTerminalPayment: async (tipAmount) => {
		// Only proceed if we are actually waiting for a tip
		if (get().tenderState !== "awaitingTip") return;

		set({
			tenderState: "processingPayment", // Show a generic processing view
			tipAmount: tipAmount,
			balanceDue: get().balanceDue + tipAmount, // Add tip to balance
		});

		const context = {
			orderId: get().orderId,
			balanceDue: get().balanceDue,
			tipAmount: get().tipAmount,
			// --- THIS IS THE FIX ---
			// Pass a function to the model so it can update our state immediately
			setPaymentIntentId: (id) => set({ currentPaymentIntentId: id }),
		};

		const result = await terminalPaymentModel.process(context);

		if (result.success) {
			const { data } = result;
			set({
				balanceDue: data.balance_due,
				tenderState: "complete",
				currentPaymentIntentId: null, // Clear the ID on success
			});
		} else {
			// The model now returns the ID even on failure
			set({
				tenderState: "paymentError",
				error: result.error,
				balanceDue: get().balanceDue - get().tipAmount,
				tipAmount: 0,
				currentPaymentIntentId:
					result.paymentIntentId || get().currentPaymentIntentId,
			});
		}
	},
});
