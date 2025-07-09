import { useEffect } from "react";
import { usePosStore } from "@/domains/pos/store/posStore";

export const useCustomerTipListener = () => {
	const applyTipAndProcessTerminalPayment = usePosStore(
		(state) => state.applyTipAndProcessTerminalPayment
	);

	useEffect(() => {
		if (window.electronAPI) {
			const cleanup = window.electronAPI.onCustomerDisplayAction((action) => {
				if (action.channel === "CUSTOMER_TO_POS_TIP") {
					applyTipAndProcessTerminalPayment(action.data);
				}
			});
			return () => {
				if (cleanup) cleanup();
			};
		}
	}, [applyTipAndProcessTerminalPayment]);
};
