import React, { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
	DialogDescription,
} from "@/shared/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { formatCurrency } from "@/shared/lib/utils";
import { useToast } from "@/shared/components/ui/use-toast";

const refundReasons = [
	{ value: "requested_by_customer", label: "Customer Request" },
	{ value: "duplicate", label: "Duplicate Transaction" },
	{ value: "fraudulent", label: "Fraudulent Transaction" },
];

export function RefundDialog({
	isOpen,
	onOpenChange,
	transaction,
	isRefunding,
	onSubmit,
}) {
	const [amount, setAmount] = useState("");
	const [reason, setReason] = useState("");
	const { toast } = useToast();

	const maxRefundable =
		parseFloat(transaction.amount) -
		parseFloat(transaction.refunded_amount || 0);

	const handleSubmit = () => {
		const refundAmount = parseFloat(amount);

		if (isNaN(refundAmount) || refundAmount <= 0) {
			toast({
				title: "Invalid Amount",
				description: "Please enter a positive refund amount.",
				variant: "destructive",
			});
			return;
		}
		if (!reason) {
			toast({
				title: "Reason Required",
				description: "Please select a reason for the refund.",
				variant: "destructive",
			});
			return;
		}

		onSubmit({
			transaction_id: transaction.id,
			amount: refundAmount.toFixed(2),
			reason,
		});
	};

	const handleAmountChange = (e) => {
		let value = e.target.value;

		// --- NEW: Capping logic for decimal places ---
		const decimalRegex = /^\d*(\.\d{0,2})?$/;
		if (value !== "" && !decimalRegex.test(value)) {
			// If the input doesn't match the pattern (e.g., has > 2 decimal places),
			// we simply don't update the state, effectively ignoring the invalid character.
			return;
		}
		// --- END NEW ---

		const numericValue = parseFloat(value);

		// Cap the total value if it exceeds the maximum refundable amount
		if (!isNaN(numericValue) && numericValue > maxRefundable) {
			setAmount(maxRefundable.toFixed(2));
		} else {
			setAmount(value);
		}
	};

	const handleOpenChange = (open) => {
		if (!open) {
			setAmount("");
			setReason("");
		}
		onOpenChange(open);
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={handleOpenChange}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Refund Transaction</DialogTitle>
					<DialogDescription>
						Max refundable amount:{" "}
						<span className="font-bold">{formatCurrency(maxRefundable)}</span>
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 py-4">
					<div className="grid grid-cols-4 items-center gap-4">
						<Label
							htmlFor="amount"
							className="text-right"
						>
							Amount
						</Label>
						<Input
							id="amount"
							type="number"
							value={amount}
							onChange={handleAmountChange}
							className="col-span-3"
							placeholder={`e.g., ${maxRefundable.toFixed(2)}`}
						/>
					</div>
					<div className="grid grid-cols-4 items-center gap-4">
						<Label
							htmlFor="reason"
							className="text-right"
						>
							Reason
						</Label>
						<Select
							value={reason}
							onValueChange={setReason}
						>
							<SelectTrigger className="col-span-3">
								<SelectValue placeholder="Select a reason..." />
							</SelectTrigger>
							<SelectContent>
								{refundReasons.map((r) => (
									<SelectItem
										key={r.value}
										value={r.value}
									>
										{r.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isRefunding}
					>
						Cancel
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={isRefunding}
					>
						{isRefunding
							? "Refunding..."
							: `Refund ${formatCurrency(parseFloat(amount) || 0)}`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
