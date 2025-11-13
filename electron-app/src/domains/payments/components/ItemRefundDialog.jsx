import { useState, useEffect } from "react";
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/components/ui/table";
import { Badge } from "@/shared/components/ui/badge";
import { formatCurrency } from "@ajeen/ui";
import { useToast } from "@/shared/components/ui/use-toast";
import { Loader2, ShoppingCart, AlertCircle } from "lucide-react";
import { calculateItemRefund } from "@/domains/payments/services/refundService";

const refundReasons = [
	{ value: "requested_by_customer", label: "Customer Request" },
	{ value: "duplicate", label: "Duplicate Transaction" },
	{ value: "fraudulent", label: "Fraudulent Transaction" },
];

/**
 * Dialog for refunding individual order items.
 * Shows order items, allows selecting quantity to refund, previews calculation.
 */
export function ItemRefundDialog({
	isOpen,
	onOpenChange,
	orderItems = [],
	paymentTransactions = [],
	onSubmit,
	isProcessing = false,
}) {
	const [selectedItems, setSelectedItems] = useState({});
	const [reason, setReason] = useState("");
	const [selectedTransaction, setSelectedTransaction] = useState(null);
	const [showTransactionSelector, setShowTransactionSelector] = useState(false);
	const [preview, setPreview] = useState(null);
	const [isCalculating, setIsCalculating] = useState(false);
	const [calculationError, setCalculationError] = useState(null);
	const { toast } = useToast();

	// Reset state when dialog opens/closes
	useEffect(() => {
		if (!isOpen) {
			setSelectedItems({});
			setReason("");
			setSelectedTransaction(null);
			setShowTransactionSelector(false);
			setPreview(null);
			setCalculationError(null);
		}
	}, [isOpen]);

	// Auto-detect if this is a split payment
	const isSplitPayment = () => {
		if (!paymentTransactions || paymentTransactions.length === 0) {
			return false;
		}
		const successfulTransactions = paymentTransactions.filter(
			(txn) => txn.status === "SUCCESSFUL" || txn.status === "REFUNDED"
		);
		return successfulTransactions.length > 1;
	};

	// PHASE 1 MVP: Split payments don't show transaction selector (will refund to cash)
	useEffect(() => {
		if (isOpen && paymentTransactions) {
			const successfulTransactions = paymentTransactions.filter(
				(txn) => txn.status === "SUCCESSFUL" || txn.status === "REFUNDED"
			);
			// Only show selector for SINGLE card payments
			// Split payments will refund to cash automatically
			if (successfulTransactions.length === 1) {
				setShowTransactionSelector(false); // No need to select if only one option
			} else if (successfulTransactions.length > 1) {
				setShowTransactionSelector(false); // Phase 1: Split payments = cash refund
			}
		}
	}, [isOpen, paymentTransactions]);

	const handleQuantityChange = (orderItemId, quantity, maxAvailable) => {
		const numQuantity = parseInt(quantity, 10);

		if (isNaN(numQuantity) || numQuantity < 0) {
			// Remove item if invalid
			const newSelected = { ...selectedItems };
			delete newSelected[orderItemId];
			setSelectedItems(newSelected);
			setPreview(null); // Clear preview when selection changes
			return;
		}

		if (numQuantity === 0) {
			// Remove item if quantity is 0
			const newSelected = { ...selectedItems };
			delete newSelected[orderItemId];
			setSelectedItems(newSelected);
			setPreview(null);
			return;
		}

		// Cap at available quantity
		const cappedQuantity = Math.min(numQuantity, maxAvailable);

		setSelectedItems({
			...selectedItems,
			[orderItemId]: cappedQuantity,
		});
		setPreview(null); // Clear preview when selection changes
	};

	const handleCalculatePreview = async () => {
		// Validation
		const itemCount = Object.keys(selectedItems).length;
		if (itemCount === 0) {
			toast({
				title: "No Items Selected",
				description: "Please select at least one item to refund.",
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

		setIsCalculating(true);
		setCalculationError(null);

		try {
			const itemIds = Object.keys(selectedItems);

			// Build request payload - same endpoint handles both single and multiple items
			let requestData;
			if (itemIds.length === 1) {
				// Single item format
				const itemId = itemIds[0];
				const quantity = selectedItems[itemId];

				requestData = {
					order_item_id: String(itemId),
					quantity: quantity,
					reason: reason,
				};

				console.log("Calculating refund for single item:", requestData);
			} else {
				// Multiple items format
				const items = itemIds.map((itemId) => ({
					order_item_id: String(itemId),
					quantity: selectedItems[itemId],
				}));

				requestData = {
					items: items,
					reason: reason,
				};

				console.log("Calculating refund for multiple items:", requestData);
			}

			// Same endpoint for both cases
			const result = await calculateItemRefund(requestData);

			console.log("Calculate refund result:", result);

			if (result.can_refund) {
				setPreview(result);
				setCalculationError(null);
			} else {
				setPreview(null);
				const errorMsg =
					result.validation_errors?.join(", ") || "Cannot process refund";
				console.log("Validation errors:", result.validation_errors);
				setCalculationError(errorMsg);
			}
		} catch (error) {
			console.error("Error calculating refund:", error);
			setCalculationError(
				error.response?.data?.error ||
					"Failed to calculate refund. Please try again."
			);
			setPreview(null);
		} finally {
			setIsCalculating(false);
		}
	};

	const handleSubmit = () => {
		if (!preview) {
			toast({
				title: "Preview Required",
				description: "Please calculate the refund preview before submitting.",
				variant: "destructive",
			});
			return;
		}

		// Convert selectedItems to array format
		const items = Object.entries(selectedItems).map(([itemId, quantity]) => ({
			order_item_id: itemId,
			quantity: quantity,
		}));

		const payload = {
			items,
			reason: reason,
		};

		// Include transaction_id if one was specifically selected
		if (selectedTransaction) {
			payload.transaction_id = selectedTransaction;
		}

		onSubmit(payload);
	};

	const getTotalSelectedQuantity = () => {
		return Object.values(selectedItems).reduce((sum, qty) => sum + qty, 0);
	};

	const handleSelectAllItems = () => {
		const newSelectedItems = {};
		orderItems.forEach((item) => {
			const refunded = item.refunded_quantity || 0;
			const available = item.quantity - refunded;
			if (available > 0) {
				newSelectedItems[item.id] = available;
			}
		});
		setSelectedItems(newSelectedItems);
		setPreview(null); // Clear preview when selection changes
	};

	const handleClearSelection = () => {
		setSelectedItems({});
		setPreview(null);
	};

	return (
		<Dialog
			open={isOpen}
			onOpenChange={onOpenChange}
		>
			<DialogContent className="sm:max-w-6xl max-h-[95vh] overflow-hidden flex flex-col w-[95vw]">
				<DialogHeader>
					<div className="flex items-center gap-3">
						<div className="p-2.5 bg-muted rounded-lg">
							<ShoppingCart className="h-5 w-5 text-foreground" />
						</div>
						<div>
							<DialogTitle className="text-foreground">
								Refund Order Items
							</DialogTitle>
							<DialogDescription className="text-muted-foreground mt-1">
								Select items and quantities to refund
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto space-y-6 py-4">
					{/* Quick Selection Actions */}
					<div className="flex items-center justify-between gap-3 px-1">
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={handleSelectAllItems}
								disabled={orderItems.every(
									(item) => (item.quantity - (item.refunded_quantity || 0)) === 0
								)}
								className="gap-2"
							>
								<ShoppingCart className="h-4 w-4" />
								Select All Items
							</Button>
							{Object.keys(selectedItems).length > 0 && (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={handleClearSelection}
									className="text-muted-foreground hover:text-foreground"
								>
									Clear Selection
								</Button>
							)}
						</div>
						{getTotalSelectedQuantity() > 0 && (
							<Badge variant="secondary" className="px-3 py-1">
								{getTotalSelectedQuantity()} item{getTotalSelectedQuantity() !== 1 ? 's' : ''} selected
							</Badge>
						)}
					</div>

					{/* Order Items Table */}
					<div className="border border-border rounded-lg overflow-hidden">
						<Table>
							<TableHeader>
								<TableRow className="border-border hover:bg-transparent">
									<TableHead className="font-semibold text-foreground">
										Item
									</TableHead>
									<TableHead className="font-semibold text-foreground text-center">
										Purchased
									</TableHead>
									<TableHead className="font-semibold text-foreground text-center">
										Already Refunded
									</TableHead>
									<TableHead className="font-semibold text-foreground text-center">
										Available
									</TableHead>
									<TableHead className="font-semibold text-foreground text-center">
										Refund Qty
									</TableHead>
									<TableHead className="font-semibold text-foreground text-right">
										Price
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{orderItems.length > 0 ? (
									orderItems.map((item) => {
										const refunded = item.refunded_quantity || 0;
										const available = item.quantity - refunded;
										const isRefundable = available > 0;

										return (
											<TableRow
												key={item.id}
												className={`border-border ${
													!isRefundable ? "opacity-50" : ""
												}`}
											>
												<TableCell className="font-medium text-foreground">
													<div className="space-y-1">
														<div>{item.product_name || "Unknown Item"}</div>
														{item.notes && (
															<div className="text-xs text-muted-foreground">
																Note: {item.notes}
															</div>
														)}
													</div>
												</TableCell>
												<TableCell className="text-center text-foreground">
													{item.quantity}
												</TableCell>
												<TableCell className="text-center">
													{refunded > 0 ? (
														<Badge variant="secondary">{refunded}</Badge>
													) : (
														<span className="text-muted-foreground">—</span>
													)}
												</TableCell>
												<TableCell className="text-center">
													<Badge variant={isRefundable ? "default" : "outline"}>
														{available}
													</Badge>
												</TableCell>
												<TableCell className="text-center">
													{isRefundable ? (
														<Input
															type="number"
															min="0"
															max={available}
															value={selectedItems[item.id] || ""}
															onChange={(e) =>
																handleQuantityChange(
																	item.id,
																	e.target.value,
																	available
																)
															}
															className="w-20 mx-auto border-border [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
															placeholder="0"
														/>
													) : (
														<span className="text-muted-foreground">N/A</span>
													)}
												</TableCell>
												<TableCell className="text-right font-medium text-foreground">
													{formatCurrency(item.price_at_sale || 0)}
												</TableCell>
											</TableRow>
										);
									})
								) : (
									<TableRow>
										<TableCell
											colSpan="6"
											className="text-center py-8 text-muted-foreground"
										>
											No items available for refund
										</TableCell>
									</TableRow>
								)}
							</TableBody>
						</Table>
					</div>

					{/* Reason Select */}
					<div className="space-y-2">
						<Label
							htmlFor="reason"
							className="text-sm font-medium text-foreground"
						>
							Refund Reason <span className="text-destructive">*</span>
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

					{/* Preview Calculation Button */}
					{getTotalSelectedQuantity() > 0 && reason && (
						<div className="flex items-center gap-3">
							<Button
								onClick={handleCalculatePreview}
								disabled={isCalculating || isProcessing}
								variant="outline"
								className="border-border"
							>
								{isCalculating && (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								)}
								Calculate Refund Preview
							</Button>
							{preview && (
								<Badge
									variant="default"
									className="text-sm"
								>
									Preview Ready
								</Badge>
							)}
						</div>
					)}

					{/* Calculation Error */}
					{calculationError && (
						<div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-3">
							<AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
							<div>
								<p className="font-semibold text-destructive">
									Validation Error
								</p>
								<p className="text-sm text-destructive/90 mt-1">
									{calculationError}
								</p>
							</div>
						</div>
					)}

					{/* Preview Display */}
					{preview && preview.refund_breakdown && (
						<div className="space-y-4">
							{/* PHASE 1 MVP: Cash Refund Warning for Split Payments */}
							{isSplitPayment() && (
								<div className="p-4 bg-amber-50 dark:bg-amber-950/20 border-2 border-amber-300 dark:border-amber-700 rounded-lg">
									<div className="flex items-start gap-3">
										<AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
										<div>
											<p className="font-bold text-amber-900 dark:text-amber-100 text-base">
												Split Payment - Cash Refund
											</p>
											<p className="text-sm text-amber-800 dark:text-amber-200 mt-1.5 leading-relaxed">
												This order was paid with <strong>multiple cards</strong>
												. To simplify the refund process, this refund will be
												issued as <strong>CASH</strong> to the customer.
											</p>
										</div>
									</div>
								</div>
							)}

							<div className="p-4 bg-muted/50 border border-border rounded-lg space-y-3">
								<div className="flex items-center gap-2">
									<div className="h-2 w-2 rounded-full bg-green-500" />
									<h3 className="font-semibold text-foreground">
										Refund Breakdown
									</h3>
								</div>
								<div className="grid grid-cols-2 gap-3">
									<div className="flex justify-between items-center p-3 bg-background rounded-lg border border-border">
										<span className="text-muted-foreground">Subtotal</span>
										<span className="font-semibold text-foreground">
											{formatCurrency(preview.refund_breakdown.subtotal)}
										</span>
									</div>
									<div className="flex justify-between items-center p-3 bg-background rounded-lg border border-border">
										<span className="text-muted-foreground">Tax</span>
										<span className="font-semibold text-foreground">
											{formatCurrency(preview.refund_breakdown.tax)}
										</span>
									</div>
									<div className="flex justify-between items-center p-3 bg-background rounded-lg border border-border">
										<span className="text-muted-foreground">Tip</span>
										<span className="font-semibold text-foreground">
											{formatCurrency(preview.refund_breakdown.tip)}
										</span>
									</div>
									<div className="flex justify-between items-center p-3 bg-background rounded-lg border border-border">
										<span className="text-muted-foreground">Surcharge</span>
										<span className="font-semibold text-foreground">
											{formatCurrency(preview.refund_breakdown.surcharge)}
										</span>
									</div>
								</div>
								<div className="flex justify-between items-center p-4 bg-primary/10 rounded-lg border-2 border-primary">
									<span className="font-bold text-foreground text-lg">
										Total Refund
									</span>
									<span className="font-bold text-foreground text-xl">
										{formatCurrency(preview.refund_breakdown.total)}
									</span>
								</div>
							</div>

							{/* Transaction Selector (only for split payments after preview) */}
							{showTransactionSelector &&
								paymentTransactions &&
								paymentTransactions.length > 1 && (
									<div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg space-y-3">
										<div className="flex items-start gap-2">
											<AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
											<div className="flex-1">
												<Label className="text-sm font-semibold text-blue-900 dark:text-blue-100">
													Choose Refund Destination
												</Label>
												<p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
													This order was paid with multiple cards. Select which
													card should receive the{" "}
													{formatCurrency(preview.refund_breakdown.total)}{" "}
													refund.
												</p>
											</div>
										</div>
										<Select
											value={selectedTransaction || "auto"}
											onValueChange={(value) =>
												setSelectedTransaction(value === "auto" ? null : value)
											}
										>
											<SelectTrigger className="border-blue-200 dark:border-blue-800 bg-background">
												<SelectValue />
											</SelectTrigger>
											<SelectContent className="border-border bg-background">
												<SelectItem value="auto">
													<div className="flex items-center gap-2">
														<span className="font-medium">
															Auto (Most Recent)
														</span>
														<Badge
															variant="outline"
															className="text-xs"
														>
															Recommended
														</Badge>
													</div>
												</SelectItem>
												{paymentTransactions
													.filter((txn) => txn.status === "SUCCESSFUL")
													.sort(
														(a, b) =>
															new Date(b.created_at) - new Date(a.created_at)
													)
													.map((txn) => {
														const totalAmount =
															Number.parseFloat(txn.amount || 0) +
															Number.parseFloat(txn.tip || 0) +
															Number.parseFloat(txn.surcharge || 0);
														const refundedAmount = Number.parseFloat(
															txn.refunded_amount || 0
														);
														const availableToRefund =
															totalAmount - refundedAmount;
														const refundTotal = preview.refund_breakdown.total;
														const isInsufficient =
															availableToRefund < refundTotal;

														return (
															<SelectItem
																key={txn.id}
																value={txn.id}
																disabled={isInsufficient}
															>
																<div className="flex items-center justify-between gap-4 w-full">
																	<div className="flex items-center gap-2">
																		{txn.card_brand && txn.card_last4 ? (
																			<>
																				<span className="font-medium capitalize">
																					{txn.card_brand}
																				</span>
																				<span className="text-muted-foreground font-mono text-xs">
																					****{txn.card_last4}
																				</span>
																			</>
																		) : (
																			<span className="font-medium capitalize">
																				{txn.method.replace("_", " ")}
																			</span>
																		)}
																	</div>
																	<div className="flex items-center gap-2">
																		<span
																			className={`text-sm ${
																				isInsufficient
																					? "text-destructive"
																					: "text-muted-foreground"
																			}`}
																		>
																			{formatCurrency(availableToRefund)}{" "}
																			available
																		</span>
																		{isInsufficient && (
																			<Badge
																				variant="destructive"
																				className="text-xs"
																			>
																				Insufficient
																			</Badge>
																		)}
																	</div>
																</div>
															</SelectItem>
														);
													})}
											</SelectContent>
										</Select>
									</div>
								)}
						</div>
					)}
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isProcessing || isCalculating}
						className="border-border"
					>
						Cancel
					</Button>
					<Button
						onClick={handleSubmit}
						disabled={!preview || isProcessing || isCalculating || !reason}
						className="bg-primary hover:bg-primary/90 text-primary-foreground"
					>
						{isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						{isProcessing
							? "Processing Refund..."
							: preview
							? `Refund ${formatCurrency(preview.refund_breakdown?.total || 0)}`
							: "Process Refund"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
