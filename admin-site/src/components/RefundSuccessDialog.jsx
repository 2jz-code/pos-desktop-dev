import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@ajeen/ui";
import { CheckCircle2, Banknote, CreditCard, AlertCircle } from "lucide-react";

/**
 * Dialog shown after a successful refund to confirm the transaction
 * and show cashiers how much cash to return (for split payments)
 */
export function RefundSuccessDialog({
	isOpen,
	onOpenChange,
	refundData,
	paymentTransactions = [],
}) {
	if (!refundData) return null;

	const {
		total_refunded,
		refund_items = [],
		is_split_payment = false,
		refund_method = 'CARD',
	} = refundData;

	const isCashRefund = is_split_payment || refund_method === 'CASH';

	// Get card details for card refunds
	const getCardDetails = () => {
		if (isCashRefund || !paymentTransactions || paymentTransactions.length === 0) {
			return null;
		}
		// Get the most recent successful card transaction
		const cardTransaction = paymentTransactions
			.filter(txn => txn.status === 'SUCCESSFUL' && txn.card_last4)
			.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];

		return cardTransaction;
	};

	const cardDetails = getCardDetails();

	return (
		<Dialog
			open={isOpen}
			onOpenChange={onOpenChange}
		>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className={`p-2.5 rounded-lg ${isCashRefund ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
								{isCashRefund ? (
									<Banknote className="h-5 w-5 text-amber-700 dark:text-amber-400" />
								) : (
									<CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
								)}
							</div>
							<div>
								<DialogTitle className="text-foreground text-lg">
									Refund Processed
								</DialogTitle>
								<p className="text-sm text-muted-foreground mt-0.5">
									{isCashRefund ? (
										is_split_payment ? 'Split payment - Cash required' : 'Cash payment'
									) : (
										'Card refund initiated'
									)}
								</p>
							</div>
						</div>
					</div>
				</DialogHeader>

				<div className="space-y-5 py-4">

					{/* Cash Refund Alert */}
					{isCashRefund && (
						<div className="p-4 bg-amber-50 dark:bg-amber-950/20 border-l-4 border-amber-500 dark:border-amber-600 rounded-r-lg">
							<div className="space-y-2">
								<div className="flex items-center gap-2">
									<Banknote className="h-4 w-4 text-amber-700 dark:text-amber-400" />
									<p className="font-semibold text-amber-900 dark:text-amber-100 text-sm">
										Cash Required
									</p>
								</div>
								<p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
									{is_split_payment ? (
										<>Multiple card payment - refund must be issued as cash to customer</>
									) : (
										<>Original payment was cash - refund as cash to customer</>
									)}
								</p>
							</div>
						</div>
					)}

					{/* Card Refund Info */}
					{!isCashRefund && cardDetails && (
						<div className="p-4 bg-blue-50 dark:bg-blue-950/20 border-l-4 border-blue-500 dark:border-blue-600 rounded-r-lg">
							<div className="space-y-2.5">
								<div className="flex items-center gap-2">
									<CreditCard className="h-4 w-4 text-blue-700 dark:text-blue-400" />
									<p className="font-semibold text-blue-900 dark:text-blue-100 text-sm">
										Refunded to Card
									</p>
								</div>
								<div className="space-y-1">
									<p className="text-sm text-blue-800 dark:text-blue-200">
										{cardDetails.card_brand} •••• {cardDetails.card_last4}
									</p>
									<p className="text-xs text-blue-700 dark:text-blue-300">
										Processing time: 5-10 business days
									</p>
								</div>
							</div>
						</div>
					)}

					{/* Refund Amount */}
					<div className="text-center py-8 px-6 bg-muted/30 dark:bg-muted/10 rounded-lg border border-border">
						<p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-3">
							{isCashRefund ? 'Cash Amount' : 'Refund Amount'}
						</p>
						<div className="flex items-baseline justify-center gap-2">
							<span className="text-2xl font-semibold text-muted-foreground">$</span>
							<span className="text-6xl font-bold tracking-tight text-foreground">
								{Number(total_refunded || 0).toFixed(2).split('.')[0]}
							</span>
							<span className="text-3xl font-semibold text-muted-foreground">
								.{Number(total_refunded || 0).toFixed(2).split('.')[1]}
							</span>
						</div>
						{isCashRefund && (
							<p className="text-sm text-muted-foreground mt-4">
								Count and provide to customer
							</p>
						)}
					</div>

					{/* Refunded Items */}
					{refund_items.length > 0 && (
						<div className="space-y-3">
							<Separator />
							<div>
								<h4 className="text-sm font-semibold text-foreground mb-3">
									Refunded Items
								</h4>
								<div className="space-y-2">
									{refund_items.map((item, index) => (
										<div
											key={index}
											className="flex items-center justify-between py-2 px-3 bg-muted/20 rounded-md"
										>
											<div className="flex items-center gap-3">
												<Badge variant="outline" className="font-mono">
													×{item.quantity_refunded || item.quantity || 1}
												</Badge>
												<span className="text-sm text-foreground">
													{item.order_item_name || item.product_name || "Item"}
												</span>
											</div>
											<span className="text-sm font-medium text-foreground">
												{formatCurrency(item.total_refund_amount || 0)}
											</span>
										</div>
									))}
								</div>
							</div>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button
						onClick={() => onOpenChange(false)}
						className="w-full"
						size="lg"
					>
						Done
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
