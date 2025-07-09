import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { usePosStore } from "@/domains/pos/store/posStore";
import { shallow } from "zustand/shallow";

export const useSyncToCustomerDisplay = () => {
	const location = useLocation();
	const customerDisplayState = usePosStore((state) => {
		const isPaymentActive =
			state.tenderState &&
			state.tenderState !== "idle" &&
			state.tenderState !== "awaitingPaymentMethod";

		// Calculate the correct payment amount for customer display
		// For split payments, show the split amount; for full payments, show balance due
		const isSplitPayment = state.partialAmount > 0;
		const baseAmount = isSplitPayment ? state.partialAmount : state.balanceDue;

		// Add surcharge to the base amount for the total customer payment amount
		const customerPaymentAmount = baseAmount + (state.surchargeAmount || 0);

		// We construct a state object that matches the precise format
		// that the original CustomerDisplay.jsx was designed to work with.
		return {
			// Cart properties
			cartItems: state.items,
			cartTotal: state.total,
			hasCartItems: state.items && state.items.length > 0,

			// Payment properties, mapped to the expected format
			status: isPaymentActive ? "in-progress" : "active",
			balanceDue: customerPaymentAmount, // Now shows correct amount including surcharge
			orderForPayment: state.order,
			paymentMethod: state.paymentMethod,

			// This now directly controls which view the CustomerDisplay shows
			activeView: state.tenderState,
			// ADDED: The current path of the main window
			pathname: location.pathname,
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
