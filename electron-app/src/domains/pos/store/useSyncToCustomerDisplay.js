import { useEffect } from "react";
import { usePosStore } from "@/domains/pos/store/posStore";
import { shallow } from "zustand/shallow";

export const useSyncToCustomerDisplay = () => {
	const customerDisplayState = usePosStore((state) => {
		const isPaymentActive =
			state.tenderState &&
			state.tenderState !== "idle" &&
			state.tenderState !== "awaitingPaymentMethod";

		// Calculate the correct payment amount for customer display
		// For split payments, show the split amount; for full payments, show balance due
		const isSplitPayment = state.partialAmount > 0;
		const baseAmount = isSplitPayment ? state.partialAmount : state.balanceDue;

		// The baseAmount already includes the surcharge. No further addition is needed.
		const customerPaymentAmount = isSplitPayment
			? baseAmount + (state.surchargeAmount || 0)
			: baseAmount;

		// We construct a state object that matches the precise format
		// that the original CustomerDisplay.jsx was designed to work with.
		return {
			// Cart properties
			cartItems: state.items,
			cartTotal: state.total,
			hasCartItems: state.items && state.items.length > 0,

			// Payment properties, mapped to the expected format
			status: isPaymentActive ? "in-progress" : "active",
			balanceDue: customerPaymentAmount, // Now shows correct amount for tips
			orderForPayment: state.order,

			// This now directly controls which view the CustomerDisplay shows
			activeView: state.tenderState,
		};
	}, shallow);

	useEffect(() => {
		if (window.electronAPI) {
			window.electronAPI.sendToCustomerDisplay(
				"POS_TO_CUSTOMER_STATE",
				customerDisplayState
			);
		}
	}, [customerDisplayState]);
};
