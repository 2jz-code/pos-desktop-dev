import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
	DialogDescription,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@ajeen/ui";
import { useToast } from "@/components/ui/use-toast";

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
		Number.parseFloat(transaction.amount) -
		Number.parseFloat(transaction.refunded_amount || 0);

	const handleSubmit = () => {
		const refundAmount = Number.parseFloat(amount);

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
		const value = e.target.value;

		// Capping logic for decimal places
		const decimalRegex = /^\d*(\.\d{0,2})?$/;
		if (value !== "" && !decimalRegex.test(value)) {
			// If the input doesn't match the pattern (e.g., has > 2 decimal places),
			// we simply don't update the state, effectively ignoring the invalid character.
			return;
		}

		const numericValue = Number.parseFloat(value);

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
					<DialogTitle className="text-foreground">
						Refund Transaction
					</DialogTitle>
					<DialogDescription className="text-muted-foreground">
						Max refundable amount:{" "}
						<span className="font-bold text-foreground">
							{formatCurrency(maxRefundable)}
						</span>
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-6 py-4">
					<div className="space-y-2">
						<Label
							htmlFor="amount"
							className="text-sm font-medium text-foreground"
						>
							Refund Amount
						</Label>
						<Input
							id="amount"
							type="number"
							value={amount}
							onChange={handleAmountChange}
							className="border-border bg-background"
							placeholder={`e.g., ${maxRefundable.toFixed(2)}`}
						/>
					</div>
					<div className="space-y-2">
						<Label
							htmlFor="reason"
							className="text-sm font-medium text-foreground"
						>
							Refund Reason
						</Label>
						<Select
							value={reason}
							onValueChange={setReason}
						>
							<SelectTrigger className="border-border bg-background">
								<SelectValue placeholder="Select a reason..." />
							</SelectTrigger>
							<SelectContent className="border-border bg-background">
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
						className="border-border"
					>
						Cancel
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={isRefunding}
						className="bg-primary hover:bg-primary/90 text-primary-foreground"
					>
						{isRefunding
							? "Refunding..."
							: `Refund ${formatCurrency(Number.parseFloat(amount) || 0)}`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
