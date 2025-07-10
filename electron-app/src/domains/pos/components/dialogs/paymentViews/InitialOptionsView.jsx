import { Button } from "@/shared/components/ui/button";
import { usePosStore } from "@/domains/pos/store/posStore";
import { CreditCard, DollarSign, Gift } from "lucide-react";

/**
 * @description
 * This view presents the initial payment choices to the user.
 * It does NOT contain its own logic for state changes. Instead, it calls the
 * `onSelect` function passed down as a prop from its parent (TenderDialog).
 * This keeps the state machine logic centralized in the paymentSlice.
 */
const InitialOptionsView = ({ onSelect }) => {
	// We only get `selectPaymentMethod` from the store to handle the split payment case.
	const { selectPaymentMethod } = usePosStore();

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
