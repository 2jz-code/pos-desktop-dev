import { useEffect } from "react";
import { usePosStore } from "@/domains/pos/store/posStore";

export const useCustomerTipListener = () => {
	const applyTipAndProcessTerminalPayment = usePosStore(
		(state) => state.applyTipAndProcessTerminalPayment
	);

	useEffect(() => {
		if (window.ipcApi) {
			// Use the new standardized channel name
			const cleanup = window.ipcApi.receive(
				"CUSTOMER_TO_POS_TIP",
				(tipAmount) => {
					applyTipAndProcessTerminalPayment(tipAmount);
				}
			);
			return () => {
				if (cleanup) cleanup();
			};
		}
	}, [applyTipAndProcessTerminalPayment]);
};
