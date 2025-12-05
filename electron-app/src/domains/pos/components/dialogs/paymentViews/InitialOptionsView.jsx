import { Button } from "@/shared/components/ui/button";
import { usePosStore } from "@/domains/pos/store/posStore";
import { useOnlineStatus } from "@/shared/hooks";
import { CreditCard, DollarSign, Gift, Truck, WifiOff } from "lucide-react";
import { shallow } from "zustand/shallow";

/**
 * @description
 * This view presents the initial payment choices to the user.
 * It does NOT contain its own logic for state changes. Instead, it calls the
 * `onSelect` function passed down as a prop from its parent (TenderDialog).
 * This keeps the state machine logic centralized in the paymentSlice.
 *
 * When offline, only Cash payment is available - other methods require
 * network connectivity for processing.
 */
const InitialOptionsView = ({ onSelect }) => {
	// We only get `selectPaymentMethod` from the store to handle the split payment case.
	const { selectPaymentMethod } = usePosStore(
		(state) => ({
			selectPaymentMethod: state.selectPaymentMethod,
		}),
		shallow
	);

	// Check CURRENT network state, not whether order was created offline
	// This allows card payments when connection is restored mid-order
	const isOnline = useOnlineStatus();
	const isCurrentlyOffline = !isOnline;

	const handleSelect = (method) => {
		// Use the `onSelect` prop for standard payment methods.
		if (onSelect) {
			onSelect(method);
		}
	};

	const handleSplit = () => {
		// For split payment, we directly call the state transition.
		selectPaymentMethod("SPLIT");
	};

	// When currently offline, show only the Cash option prominently
	if (isCurrentlyOffline) {
		return (
			<div className="flex flex-col space-y-4">
				{/* Offline notice */}
				<div className="flex items-center justify-center gap-2 p-3 bg-orange-100 dark:bg-orange-950/30 rounded-lg text-orange-700 dark:text-orange-300">
					<WifiOff className="h-5 w-5" />
					<span className="text-sm font-medium">Offline Mode - Cash Only</span>
				</div>

				<Button
					variant="outline"
					className="w-full py-8 text-xl flex items-center justify-center gap-3 border-2 border-green-500 hover:bg-green-50 dark:hover:bg-green-950/20"
					onClick={() => handleSelect("CASH")}
				>
					<DollarSign className="h-6 w-6" />
					Cash Payment
				</Button>

				{/* Disabled options with explanation */}
				<div className="space-y-2 pt-4 border-t border-border/60">
					<p className="text-xs text-muted-foreground text-center mb-3">
						These options require network connectivity:
					</p>
					<Button
						variant="outline"
						className="w-full py-4 text-base flex items-center justify-center gap-3 opacity-50"
						disabled
					>
						<CreditCard className="h-4 w-4" />
						Card / Terminal
					</Button>
					<Button
						variant="outline"
						className="w-full py-4 text-base flex items-center justify-center gap-3 opacity-50"
						disabled
					>
						<Gift className="h-4 w-4" />
						Gift Card
					</Button>
				</div>
			</div>
		);
	}

	// Normal online flow - show all payment options
	return (
		<div className="flex flex-col space-y-4">
			<Button
				variant="outline"
				className="w-full py-6 text-lg flex items-center justify-center gap-3"
				onClick={() => handleSelect("CASH")}
			>
				<DollarSign className="h-5 w-5" />
				Cash
			</Button>
			<Button
				variant="outline"
				className="w-full py-6 text-lg flex items-center justify-center gap-3"
				onClick={() => handleSelect("CREDIT")}
			>
				<CreditCard className="h-5 w-5" />
				Card / Terminal
			</Button>
			<Button
				variant="outline"
				className="w-full py-6 text-lg flex items-center justify-center gap-3"
				onClick={() => handleSelect("GIFT_CARD")}
			>
				<Gift className="h-5 w-5" />
				Gift Card
			</Button>
			<Button
				variant="outline"
				className="w-full py-6 text-lg flex items-center justify-center gap-3 border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-800 dark:text-orange-300 dark:hover:bg-orange-950/20"
				onClick={() => handleSelect("DELIVERY")}
			>
				<Truck className="h-5 w-5" />
				Delivery
			</Button>
			<Button
				variant="default"
				className="w-full py-6 text-lg"
				onClick={handleSplit}
			>
				Split Payment
			</Button>
		</div>
	);
};

export default InitialOptionsView;
