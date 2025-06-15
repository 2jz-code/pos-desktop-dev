import { createMachine, assign } from "xstate";

export const tenderStateMachine = createMachine({
	id: "tender",
	initial: "initial",
	context: {
		orderId: null,
		balanceDue: 0,
		tipAmount: 0,
		paymentHistory: [],
		changeDue: 0,
		error: null,
	},
	states: {
		initial: {
			on: {
				START_PAYMENT: {
					target: "awaitingPaymentMethod",
					// --- THIS IS THE FIX ---
					// Place the action logic directly inside the machine.
					// This failed before due to the React 19 issue, but should now work.
					actions: assign((context, event) => {
						console.log(
							"[DEBUG 5/5] State Machine: assignInitialContext received event with balanceDue:",
							event.balanceDue
						);
						return {
							...context,
							orderId: event.orderId,
							balanceDue: event.balanceDue,
						};
					}),
				},
			},
		},
		awaitingPaymentMethod: {
			on: {
				SELECT_CASH: "processingCashPayment",
				SELECT_CREDIT: "awaitingTip",
				SELECT_SPLIT: "splittingPayment",
				// The CANCEL event resets the machine back to its initial state.
				CANCEL: "initial",
			},
		},
		awaitingTip: {
			on: {
				ADD_TIP: {
					target: "processingTerminalPayment",
					actions: "assignTipAmount",
				},
				SKIP_TIP: "processingTerminalPayment",
				CANCEL: "initial",
				GO_BACK: "awaitingPaymentMethod",
			},
		},
		processingTerminalPayment: {
			invoke: {
				id: "processTerminalPayment",
				// This service (async function) is referenced by name.
				src: "processTerminalPayment",
				onDone: {
					target: "evaluatingBalance",
					actions: "updateBalance",
				},
				onError: {
					target: "paymentError",
					actions: "logError",
				},
			},
		},
		processingCashPayment: {
			invoke: {
				id: "processCashPayment",
				src: "processCashPayment",
				onDone: {
					target: "evaluatingBalance",
					actions: "updateBalance",
				},
				onError: {
					target: "paymentError",
					actions: "logError",
				},
			},
		},
		evaluatingBalance: {
			// This state immediately transitions to another state based on a condition.
			always: [
				{ target: "complete", guard: "isFullyPaid" },
				{ target: "splittingPayment" },
			],
		},
		complete: {
			on: {
				RESET: "initial",
			},
		},
		paymentError: {
			on: {
				RETRY: "awaitingPaymentMethod",
				CANCEL: "initial",
			},
		},
		splittingPayment: {
			on: {
				PAY_PARTIAL_CASH: "processingCashPayment",
				PAY_PARTIAL_CARD: "processingTerminalPayment",
				CANCEL: "initial",
				GO_BACK: "awaitingPaymentMethod",
			},
		},
	},
});
