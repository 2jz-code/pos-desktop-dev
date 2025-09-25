import React, { useState, useEffect } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { usePosStore } from "@/domains/pos/store/posStore";
import { formatCurrency } from "@/shared/lib/utils";
import { shallow } from "zustand/shallow";
import { calculateSurcharge } from "@/domains/payments/services/paymentService";

const SplitPaymentView = () => {
	const { balanceDue, prepareToPaySplit, goBack } = usePosStore(
		(state) => ({
			balanceDue: state.balanceDue,
			prepareToPaySplit: state.prepareToPaySplit,
			goBack: state.goBack,
		}),
		shallow
	);

	const [customAmount, setCustomAmount] = useState("");
	const [surcharge, setSurcharge] = useState(0);

	useEffect(() => {
		const calculate = async () => {
			if (customAmount > 0) {
				const response = await calculateSurcharge(customAmount);
				setSurcharge(parseFloat(response.surcharge) || 0);
			} else {
				setSurcharge(0);
			}
		};
		calculate();
	}, [customAmount]);

	const handleSplitEqually = (numSplits) => {
		const amount = balanceDue / numSplits;
		setCustomAmount(amount.toFixed(2));
	};

	const handlePayRemaining = () => {
		setCustomAmount(balanceDue.toFixed(2));
	};

	const handleNavigateToPayment = (method) => {
		const amount = parseFloat(customAmount);
		if (amount > 0 && amount <= balanceDue) {
			prepareToPaySplit(amount, method);
		} else {
			console.error("Invalid custom amount");
		}
	};

	return (
		<div className="flex flex-col space-y-4 p-4">
			<h3 className="text-lg font-semibold text-center">
				Remaining Balance: {formatCurrency(balanceDue)}
			</h3>

			<div>
				<p className="text-sm font-medium mb-2 text-center">Split Equally</p>
				<div className="grid grid-cols-3 gap-2">
					<Button
						variant="outline"
						onClick={() => handleSplitEqually(2)}
					>
						By 2
					</Button>
					<Button
						variant="outline"
						onClick={() => handleSplitEqually(3)}
					>
						By 3
					</Button>
					<Button
						variant="outline"
						onClick={() => handleSplitEqually(4)}
					>
						By 4
					</Button>
				</div>
			</div>

			<div>
				<p className="text-sm font-medium mb-2 text-center">
					Pay Custom Amount
				</p>
				<div className="flex items-center space-x-2">
					<Input
						type="number"
						placeholder="Enter amount"
						value={customAmount}
						onChange={(e) => setCustomAmount(e.target.value)}
						className="text-center"
					/>
				</div>
				{surcharge > 0 && (
					<p className="text-sm text-center text-muted-foreground mt-2">
						Surcharge: {formatCurrency(surcharge)}
					</p>
				)}
				{/* --- NEW BUTTON --- */}
				<Button
					variant="secondary"
					className="w-full mt-2"
					onClick={handlePayRemaining}
				>
					Pay Remaining Amount
				</Button>
				<div className="grid grid-cols-2 gap-2 mt-2">
					<Button
						onClick={() => handleNavigateToPayment("CASH")}
						disabled={!customAmount}
					>
						Pay with Cash
					</Button>
					<Button
						onClick={() => handleNavigateToPayment("CREDIT")}
						disabled={!customAmount}
					>
						Pay with Card
					</Button>
				</div>
			</div>

			<Button
				variant="link"
				onClick={goBack}
			>
				Back to payment options
			</Button>
		</div>
	);
};

export default SplitPaymentView;
