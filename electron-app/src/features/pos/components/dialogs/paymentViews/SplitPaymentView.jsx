import React, { useState, useMemo } from "react";
import { usePosStore } from "@/store/posStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
	CardFooter,
} from "@/components/ui/card";
import { shallow } from "zustand/shallow";
import { Loader2, CheckCircle, Wallet, CreditCard } from "lucide-react";

const TransactionHistory = ({ transactions }) => (
	<div>
		<h4 className="font-semibold mb-2 text-base">Payment History</h4>
		<ul className="space-y-1 text-sm text-gray-600 max-h-24 overflow-y-auto">
			{transactions.map((t, index) => (
				<li
					key={`${t.id}-${index}`}
					className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-2 rounded-md"
				>
					<span>{t.method || "N/A"} Payment</span>
					<span className="font-medium">
						${parseFloat(t.amount).toFixed(2)}
					</span>
				</li>
			))}
		</ul>
	</div>
);

const SplitPaymentView = () => {
	const { order, balanceDue, paymentHistory, status, preparePartialPayment } =
		usePosStore(
			(state) => ({
				order: state.order,
				balanceDue: state.balanceDue,
				paymentHistory: state.paymentHistory,
				status: state.status,
				preparePartialPayment: state.preparePartialPayment,
			}),
			shallow
		);

	const [customAmount, setCustomAmount] = useState("");
	const [splitWays, setSplitWays] = useState(null);

	const grandTotal = useMemo(
		() => parseFloat(order?.grand_total || 0),
		[order]
	);
	const amountPaid = useMemo(
		() => grandTotal - balanceDue,
		[grandTotal, balanceDue]
	);
	const remainingBalance = balanceDue;

	const handlePay = (amount, method) => {
		const paymentAmount = parseFloat(amount);
		if (!isNaN(paymentAmount) && paymentAmount > 0) {
			preparePartialPayment(paymentAmount, method);
		}
	};

	const isLoading = status === "processing";

	const renderPaymentActions = (amount) => (
		<div className="grid grid-cols-2 gap-2 mt-2">
			<Button
				onClick={() => handlePay(amount, "cash")}
				disabled={
					isLoading || !amount || amount <= 0 || amount > remainingBalance
				}
				className="h-14"
			>
				<Wallet className="mr-2 h-5 w-5" /> Cash
			</Button>
			<Button
				onClick={() => handlePay(amount, "credit")}
				disabled={
					isLoading || !amount || amount <= 0 || amount > remainingBalance
				}
				className="h-14"
			>
				<CreditCard className="mr-2 h-5 w-5" /> Card
			</Button>
		</div>
	);

	return (
		<Card className="w-full max-w-lg mx-auto">
			<CardHeader>
				<CardTitle>Split Payment</CardTitle>
				<CardDescription>
					Select an amount to pay with cash or card.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="text-center space-y-2 p-4 bg-muted rounded-lg">
					<p className="text-sm font-medium text-gray-500">Amount Remaining</p>
					<p className="text-5xl font-bold tracking-tight text-primary">
						${remainingBalance.toFixed(2)}
					</p>
					<p className="text-xs text-gray-500">
						Total: ${grandTotal.toFixed(2)} | Paid: ${amountPaid.toFixed(2)}
					</p>
				</div>

				{paymentHistory?.length > 0 && (
					<TransactionHistory transactions={paymentHistory} />
				)}

				<div className="space-y-4">
					<div>
						<label
							htmlFor="custom-amount"
							className="font-medium text-sm"
						>
							1. Pay a Custom Amount
						</label>
						<Input
							id="custom-amount"
							type="number"
							placeholder="e.g., 25.50"
							value={customAmount}
							onChange={(e) => setCustomAmount(e.target.value)}
							className="text-lg h-12 mt-1"
							disabled={isLoading || remainingBalance <= 0}
						/>
						{customAmount > 0 && renderPaymentActions(customAmount)}
					</div>

					<div>
						<label className="font-medium text-sm">2. Pay Full Remaining</label>
						{renderPaymentActions(remainingBalance)}
					</div>

					<div>
						<label className="font-medium text-sm">3. Split Evenly</label>
						<div className="grid grid-cols-4 gap-2 mt-1">
							{[2, 3, 4].map((ways) => (
								<Button
									key={ways}
									variant={splitWays === ways ? "default" : "outline"}
									onClick={() => setSplitWays(ways)}
									disabled={isLoading}
								>
									by {ways}
								</Button>
							))}
							<Button
								variant={splitWays === "custom" ? "default" : "outline"}
								onClick={() => setSplitWays("custom")}
								disabled={isLoading}
							>
								...
							</Button>
						</div>
						{splitWays && (
							<div className="mt-2">
								{splitWays === "custom" ? (
									<Input
										type="number"
										placeholder="Enter number of ways"
										onChange={(e) => setSplitWays(parseInt(e.target.value, 10))}
										className="text-lg h-12"
										autoFocus
									/>
								) : (
									<p className="text-center p-2 bg-blue-50 text-blue-800 rounded-md">
										Paying{" "}
										<span className="font-bold">
											${(remainingBalance / splitWays).toFixed(2)}
										</span>{" "}
										per person.
									</p>
								)}

								{splitWays > 1 &&
									renderPaymentActions(remainingBalance / splitWays)}
							</div>
						)}
					</div>
				</div>

				{isLoading && (
					<div className="flex items-center justify-center pt-4">
						<Loader2 className="h-6 w-6 animate-spin text-primary" />
						<p className="ml-2">Processing transaction...</p>
					</div>
				)}
			</CardContent>
			{remainingBalance <= 0 && !isLoading && (
				<CardFooter>
					<div className="w-full flex items-center justify-center p-4 bg-green-50 rounded-lg">
						<CheckCircle className="h-6 w-6 text-green-600 mr-2" />
						<p className="text-lg font-semibold text-green-800">
							Payment Complete!
						</p>
					</div>
				</CardFooter>
			)}
		</Card>
	);
};

export default SplitPaymentView;
