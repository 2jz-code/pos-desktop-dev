import { useEffect } from "react";
import { usePosStore } from "@/domains/pos/store/posStore";
import { shallow } from "zustand/shallow";

export const useSyncToCustomerDisplay = () => {
	const customerDisplayState = usePosStore((state) => {
		const isPaymentActive =
			state.tenderState &&
			state.tenderState !== "idle" &&
			state.tenderState !== "awaitingPaymentMethod";

		// --- THIS IS THE FIX ---
		// We construct a state object that matches the precise format
		// that the original CustomerDisplay.jsx was designed to work with.
		return {
			// Cart properties
			cartItems: state.items,
			cartTotal: state.total,
			hasCartItems: state.items && state.items.length > 0,

			// Payment properties, mapped to the expected format
			status: isPaymentActive ? "in-progress" : "active",
			balanceDue: state.balanceDue,
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
