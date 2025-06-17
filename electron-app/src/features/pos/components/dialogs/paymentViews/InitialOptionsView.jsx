import { Button } from "../../../../../components/ui/button";
import { usePosStore } from "../../../../../store/posStore";

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
				className="w-full py-6 text-lg"
				onClick={() => handleSelect("CASH")}
			>
				Cash
			</Button>
			<Button
				variant="outline"
				className="w-full py-6 text-lg"
				onClick={() => handleSelect("CREDIT")}
			>
				Card / Terminal
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
