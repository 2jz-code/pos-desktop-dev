import React, { useState, useEffect } from "react";
import { Button } from "../../../../../components/ui/button";
import { Input } from "../../../../../components/ui/input";
import { formatCurrency } from "../../../../../lib/utils";
import { usePosStore } from "../../../../../store/posStore";
import { shallow } from "zustand/shallow";

const CashPaymentView = ({ onProcessPayment }) => {
	// Select state directly from the top-level of the flattened store
	const { balanceDue, partialAmount } = usePosStore(
		(state) => ({
			balanceDue: state.balanceDue,
			partialAmount: state.partialAmount,
		}),
		shallow
	);

	// If we are in a split flow (partialAmount > 0), that is the amount due for this transaction.
	// Otherwise, the amount due is the total remaining balance.
	const amountDueForThisTransaction =
		partialAmount > 0 ? partialAmount : balanceDue;

	// Local state for this view to manage what the customer hands over
	const [amountTendered, setAmountTendered] = useState(0);

	// Reset local state if the amount due changes (e.g., when starting a new split)
	useEffect(() => {
		setAmountTendered(0);
	}, [amountDueForThisTransaction]);

	// Calculate change based on the amount due for this specific transaction
	const changeDue =
		amountTendered >= amountDueForThisTransaction
			? amountTendered - amountDueForThisTransaction
			: 0;

	const handleProcessPayment = () => {
		// onProcessPayment is the `applyCashPayment` action passed from TenderDialog
		if (onProcessPayment) {
			// Pass the amount the customer handed over to the action
			onProcessPayment(amountTendered);
		}
	};

	// Dynamically generate quick tender buttons for a better user experience
	const quickTenderAmounts = [
		amountDueForThisTransaction,
		...[5, 10, 20, 50, 100].filter((v) => v > amountDueForThisTransaction),
	]
		.filter((v, i, a) => a.indexOf(v) === i && v > 0)
		.slice(0, 6);

	return (
		<div className="flex flex-col space-y-4 p-4">
			<div className="text-center">
				<p className="text-sm">Amount Due</p>
				<h2 className="text-3xl font-bold">
					{formatCurrency(amountDueForThisTransaction)}
				</h2>
			</div>

			<div className="grid grid-cols-3 gap-2">
				{quickTenderAmounts.map((amount, idx) => (
					<Button
						key={`${amount}-${idx}`}
						variant="outline"
						onClick={() => setAmountTendered(amount)}
					>
						{formatCurrency(amount)}
					</Button>
				))}
			</div>

			<div className="flex items-center space-x-2">
				<Input
					type="number"
					placeholder="Custom amount tendered"
					value={amountTendered || ""}
					onChange={(e) => setAmountTendered(parseFloat(e.target.value) || 0)}
					className="text-center text-lg"
					autoFocus
				/>
			</div>

			{amountTendered > 0 && (
				<div className="text-center text-lg font-medium text-green-600">
					Change Due: {formatCurrency(changeDue)}
				</div>
			)}

			<Button
				onClick={handleProcessPayment}
				disabled={amountTendered < amountDueForThisTransaction}
				className="w-full py-6 text-lg"
			>
				Process Payment
			</Button>
		</div>
	);
};

export default CashPaymentView;
