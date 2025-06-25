import React, { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label"; // Add label for better accessibility

const presetPercentages = [15, 18, 20]; // Common tip percentages

const TipSelectionView = ({ amountDue }) => {
	const [customTip, setCustomTip] = useState("");

	const sendTip = (amount) => {
		if (window.ipcApi) {
			// Use the new standardized channel name
			window.ipcApi.send("CUSTOMER_TO_POS_TIP", amount);
		}
	};

	const handlePresetClick = (percent) => {
		const amount = ((amountDue || 0) * percent) / 100;
		sendTip(parseFloat(amount.toFixed(2)));
	};

	const handleCustomSubmit = (e) => {
		e.preventDefault();
		const amount = parseFloat(customTip);
		if (!isNaN(amount) && amount >= 0) {
			sendTip(amount);
		}
	};

	return (
		<div className="flex flex-col items-center justify-center p-8 w-full">
			<h2 className="text-4xl font-bold mb-2">Add a Tip?</h2>
			<p className="text-lg text-muted-foreground mb-6">
				Order total: ${amountDue.toFixed(2)}
			</p>

			<div className="grid grid-cols-4 gap-4 w-full mb-6">
				<Button
					variant="outline"
					className="h-24 text-2xl"
					onClick={() => sendTip(0)}
				>
					No Tip
				</Button>
				{presetPercentages.map((pct) => (
					<Button
						key={pct}
						variant="secondary"
						className="h-24 text-2xl"
						onClick={() => handlePresetClick(pct)}
					>
						{pct}%
					</Button>
				))}
			</div>

			<form
				className="flex items-end space-x-2 w-full"
				onSubmit={handleCustomSubmit}
			>
				<div className="flex-1 space-y-1">
					<Label
						htmlFor="custom-tip-amount"
						className="text-left"
					>
						Custom Amount ($)
					</Label>
					<Input
						id="custom-tip-amount"
						type="number"
						min="0"
						step="0.01"
						value={customTip}
						onChange={(e) => setCustomTip(e.target.value)}
						className="text-lg h-14"
						placeholder="Enter amount"
					/>
				</div>
				<Button
					type="submit"
					className="h-14"
				>
					Apply
				</Button>
			</form>
		</div>
	);
};

export default TipSelectionView;
