import { useState, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
	DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@ajeen/ui";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, ShoppingCart, AlertCircle } from "lucide-react";
import { calculateItemRefund } from "@/services/api/refundService";

/**
 * Dialog for refunding individual order items.
 * Shows order items, allows selecting quantity to refund, previews calculation.
 */
export function ItemRefundDialog({
	isOpen,
	onOpenChange,
	orderItems = [],
	onSubmit,
	isProcessing = false,
}) {
	const [selectedItems, setSelectedItems] = useState({});
	const [reason, setReason] = useState("");
	const [preview, setPreview] = useState(null);
	const [isCalculating, setIsCalculating] = useState(false);
	const [calculationError, setCalculationError] = useState(null);
	const { toast } = useToast();

	// Reset state when dialog opens/closes
	useEffect(() => {
		if (!isOpen) {
			setSelectedItems({});
			setReason("");
			setPreview(null);
			setCalculationError(null);
		}
	}, [isOpen]);

	const handleQuantityChange = (orderItemId, quantity) => {
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

		setSelectedItems({
			...selectedItems,
			[orderItemId]: numQuantity,
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

		if (!reason.trim()) {
			toast({
				title: "Reason Required",
				description: "Please provide a reason for the refund.",
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

				console.log('Calculating refund for single item:', requestData);
			} else {
				// Multiple items format
				const items = itemIds.map(itemId => ({
					order_item_id: String(itemId),
					quantity: selectedItems[itemId]
				}));

				requestData = {
					items: items,
					reason: reason,
				};

				console.log('Calculating refund for multiple items:', requestData);
			}

			// Same endpoint for both cases
			const result = await calculateItemRefund(requestData);

			console.log('Calculate refund result:', result);

			if (result.can_refund) {
				setPreview(result);
				setCalculationError(null);
			} else {
				setPreview(null);
				const errorMsg = result.validation_errors?.join(", ") || "Cannot process refund";
				console.log('Validation errors:', result.validation_errors);
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
				description:
					"Please calculate the refund preview before submitting.",
				variant: "destructive",
			});
			return;
		}

		// Convert selectedItems to array format
		const items = Object.entries(selectedItems).map(([itemId, quantity]) => ({
			order_item_id: itemId,
			quantity: quantity,
		}));

		onSubmit({
			items,
			reason: reason.trim(),
		});
	};

	const getTotalSelectedQuantity = () => {
		return Object.values(selectedItems).reduce((sum, qty) => sum + qty, 0);
	};

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
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
													<Badge
														variant={isRefundable ? "default" : "outline"}
													>
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
																handleQuantityChange(item.id, e.target.value)
															}
															className="w-20 mx-auto border-border"
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

					{/* Reason Input */}
					<div className="space-y-2">
						<Label htmlFor="reason" className="text-sm font-medium text-foreground">
							Refund Reason <span className="text-destructive">*</span>
						</Label>
						<Textarea
							id="reason"
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							className="border-border bg-background resize-none"
							placeholder="e.g., Customer request - wrong size"
							rows={3}
						/>
					</div>

					{/* Preview Calculation Button */}
					{getTotalSelectedQuantity() > 0 && reason.trim() && (
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
								<Badge variant="default" className="text-sm">
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
						disabled={
							!preview || isProcessing || isCalculating || !reason.trim()
						}
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
