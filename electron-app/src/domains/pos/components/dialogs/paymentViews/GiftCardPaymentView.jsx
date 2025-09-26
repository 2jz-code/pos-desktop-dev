import React, { useState, useEffect } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { CreditCard, AlertCircle, CheckCircle } from "lucide-react";
import { formatCurrency } from "@ajeen/ui";
import { usePosStore } from "@/domains/pos/store/posStore";
import { shallow } from "zustand/shallow";
import { giftCardService } from "@/domains/payments/services/giftCardService";

const GiftCardPaymentView = ({ onProcessPayment }) => {
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

	// Local state for this view
	const [giftCardCode, setGiftCardCode] = useState("");
	const [validationStatus, setValidationStatus] = useState("idle"); // idle, validating, valid, invalid
	const [validationData, setValidationData] = useState(null);
	const [customAmount, setCustomAmount] = useState(amountDueForThisTransaction);

	// Reset local state if the amount due changes
	useEffect(() => {
		setGiftCardCode("");
		setValidationStatus("idle");
		setValidationData(null);
		setCustomAmount(amountDueForThisTransaction);
	}, [amountDueForThisTransaction]);

	// Validate gift card when code changes
	useEffect(() => {
		const validateGiftCard = async () => {
			if (!giftCardCode.trim()) {
				setValidationStatus("idle");
				setValidationData(null);
				return;
			}

			if (giftCardCode.length < 3) {
				return; // Don't validate until we have at least 3 characters
			}

			setValidationStatus("validating");

			try {
				const result = await giftCardService.validateGiftCard(giftCardCode);

				if (result.success && result.data.is_valid) {
					setValidationStatus("valid");
					setValidationData(result.data);
				} else {
					setValidationStatus("invalid");
					setValidationData(
						result.data || {
							error_message: result.error || "Invalid gift card",
						}
					);
				}
			} catch (error) {
				console.error("Gift card validation error:", error);
				setValidationStatus("invalid");
				setValidationData({
					error_message: "Unable to validate gift card. Please try again.",
				});
			}
		};

		const debounceTimer = setTimeout(validateGiftCard, 500);
		return () => clearTimeout(debounceTimer);
	}, [giftCardCode]);

	const handleProcessPayment = () => {
		if (onProcessPayment && validationStatus === "valid" && validationData) {
			// Determine the amount to charge
			const amountToCharge = Math.min(
				customAmount,
				validationData.current_balance
			);

			onProcessPayment({
				method: "GIFT_CARD",
				gift_card_code: giftCardCode.trim(),
				amount: amountToCharge,
			});
		}
	};

	const canProcessPayment = () => {
		return (
			validationStatus === "valid" &&
			validationData &&
			customAmount > 0 &&
			customAmount <= validationData.current_balance
		);
	};

	// Quick amount buttons based on available balance
	const getQuickAmountButtons = () => {
		if (!validationData || validationStatus !== "valid") return [];

		const maxAmount = Math.min(
			amountDueForThisTransaction,
			validationData.current_balance
		);

		return [
			maxAmount,
			...[10, 25, 50, 100].filter(
				(v) => v < maxAmount && v <= validationData.current_balance
			),
		]
			.filter((v, i, a) => a.indexOf(v) === i && v > 0)
			.sort((a, b) => a - b)
			.slice(0, 4);
	};

	return (
		<div className="flex flex-col space-y-4 p-4">
			<div className="text-center">
				<p className="text-sm">Amount Due</p>
				<h2 className="text-3xl font-bold">
					{formatCurrency(amountDueForThisTransaction)}
				</h2>
			</div>

			{/* Gift Card Code Input */}
			<div className="space-y-2">
				<label className="text-sm font-medium">Gift Card Code</label>
				<div className="relative">
					<CreditCard className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
					<Input
						type="text"
						placeholder="Enter gift card code"
						value={giftCardCode}
						onChange={(e) => setGiftCardCode(e.target.value.toUpperCase())}
						className="pl-10 text-center text-lg uppercase"
						autoFocus
					/>
				</div>
			</div>

			{/* Validation Status */}
			{validationStatus === "validating" && (
				<Alert>
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>Validating gift card...</AlertDescription>
				</Alert>
			)}

			{validationStatus === "invalid" && validationData && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>
						{validationData.error_message || "Invalid gift card"}
					</AlertDescription>
				</Alert>
			)}

			{validationStatus === "valid" && validationData && (
				<>
					<Alert className="border-green-200 bg-green-50">
						<CheckCircle className="h-4 w-4 text-green-600" />
						<AlertDescription className="text-green-800">
							Gift card is valid. Available balance:{" "}
							<strong>{formatCurrency(validationData.current_balance)}</strong>
						</AlertDescription>
					</Alert>

					{/* Quick Amount Buttons */}
					{getQuickAmountButtons().length > 0 && (
						<div className="space-y-2">
							<label className="text-sm font-medium">Quick Amounts</label>
							<div className="grid grid-cols-2 gap-2">
								{getQuickAmountButtons().map((amount, idx) => (
									<Button
										key={`${amount}-${idx}`}
										variant="outline"
										size="sm"
										onClick={() => setCustomAmount(amount)}
									>
										{formatCurrency(amount)}
									</Button>
								))}
							</div>
						</div>
					)}

					{/* Custom Amount Input */}
					<div className="space-y-2">
						<label className="text-sm font-medium">Amount to Charge</label>
						<Input
							type="number"
							placeholder="Custom amount"
							value={customAmount || ""}
							onChange={(e) => setCustomAmount(parseFloat(e.target.value) || 0)}
							className="text-center text-lg"
							max={Math.min(
								amountDueForThisTransaction,
								validationData.current_balance
							)}
						/>
						<p className="text-xs text-muted-foreground">
							Maximum:{" "}
							{formatCurrency(
								Math.min(
									amountDueForThisTransaction,
									validationData.current_balance
								)
							)}
						</p>
					</div>

					{/* Remaining Balance after transaction */}
					{customAmount > 0 && (
						<div className="text-center text-sm text-muted-foreground">
							Remaining gift card balance after payment:{" "}
							<strong>
								{formatCurrency(validationData.current_balance - customAmount)}
							</strong>
						</div>
					)}
				</>
			)}

			<Button
				onClick={handleProcessPayment}
				disabled={!canProcessPayment()}
				className="w-full py-6 text-lg"
			>
				{validationStatus === "valid"
					? `Process Payment - ${formatCurrency(customAmount)}`
					: "Process Payment"}
			</Button>
		</div>
	);
};

export default GiftCardPaymentView;
