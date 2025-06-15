import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CashPaymentView = ({ balanceDue, onProcessPayment }) => {
	const [amount, setAmount] = useState(balanceDue.toFixed(2));

	const handleProcess = () => {
		const tenderedAmount = parseFloat(amount);
		if (!isNaN(tenderedAmount) && tenderedAmount > 0) {
			onProcessPayment(tenderedAmount);
		}
	};

	// Quick cash buttons
	const quickCashOptions = [20, 50, 100];

	return (
		<div className="flex flex-col space-y-4">
			<h2 className="text-xl font-semibold text-center">Cash Payment</h2>
			<div className="space-y-2">
				<Label htmlFor="cash-amount">Amount Tendered</Label>
				<Input
					id="cash-amount"
					type="number"
					value={amount}
					onChange={(e) => setAmount(e.target.value)}
					className="text-lg text-right"
				/>
			</div>
			<div className="grid grid-cols-3 gap-2">
				{quickCashOptions.map((value) => (
					<Button
						key={value}
						variant="outline"
						onClick={() => setAmount(value.toFixed(2))}
					>
						${value}
					</Button>
				))}
				<Button
					variant="outline"
					onClick={() => setAmount(balanceDue.toFixed(2))}
				>
					Exact
				</Button>
			</div>
			<Button
				onClick={handleProcess}
				size="lg"
			>
				Process Payment
			</Button>
		</div>
	);
};

export default CashPaymentView;
