import React from "react";
import { usePosStore } from "@/store/posStore";
import { Button } from "@/components/ui/button";
import { CheckCircle, Printer, Mail } from "lucide-react";
import { shallow } from "zustand/shallow";

const CompletionView = () => {
	const { changeDue, paymentHistory, resetPayment, resetCart } = usePosStore(
		(state) => ({
			changeDue: state.changeDue,
			paymentHistory: state.paymentHistory,
			resetPayment: state.resetPayment,
			resetCart: state.resetCart,
		}),
		shallow
	);

	const lastPayment =
		paymentHistory.length > 0
			? paymentHistory[paymentHistory.length - 1]
			: null;

	// Determine if the last payment was cash to conditionally show change
	const wasCashPayment = lastPayment?.method === "CASH";

	const handleNewOrder = () => {
		// Reset both the payment dialog and the main cart for a new order
		resetPayment();
		resetCart();
	};

	return (
		<div className="flex flex-col items-center justify-center space-y-6 p-8 text-center">
			<CheckCircle className="h-24 w-24 text-green-500" />
			<h2 className="text-3xl font-bold">Payment Successful</h2>

			{wasCashPayment && changeDue > 0 && (
				<div className="p-4 bg-blue-100 dark:bg-blue-900/50 rounded-lg w-full">
					<p className="text-lg text-blue-800 dark:text-blue-200">Change Due</p>
					<p className="text-5xl font-extrabold text-blue-900 dark:text-blue-100">
						${changeDue.toFixed(2)}
					</p>
				</div>
			)}

			<div className="w-full space-y-2 pt-4">
				<Button
					size="lg"
					className="w-full justify-center gap-2"
				>
					<Mail className="h-5 w-5" /> Email Receipt
				</Button>
				<Button
					size="lg"
					variant="secondary"
					className="w-full justify-center gap-2"
				>
					<Printer className="h-5 w-5" /> Print Receipt
				</Button>
				<Button
					size="lg"
					variant="outline"
					className="w-full"
					onClick={handleNewOrder}
					autoFocus
				>
					Start New Order
				</Button>
			</div>
		</div>
	);
};

export default CompletionView;
