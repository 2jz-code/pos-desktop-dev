"use client";

import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { usePosStore } from "@/domains/pos/store/posStore";
import { shallow } from "zustand/shallow";
import apiClient from "@/shared/lib/apiClient";
import { toast } from "@/shared/components/ui/use-toast";
import { Loader2, Tag, X, ChefHat, CreditCard, WifiOff } from "lucide-react";
import { printKitchenTicket } from "@/shared/lib/hardware/printerService";
import { useKitchenZones } from "@/domains/settings/hooks/useKitchenZones";
import { markSentToKitchen } from "@/domains/orders/services/orderService";
import { cartGateway } from "@/shared/lib/cartGateway";

const safeFormatCurrency = (value) => {
	const number = Number(value);
	if (isNaN(number)) {
		return "$0.00";
	}
	const isNegative = number < 0;
	const absoluteValue = Math.abs(number);
	return `${isNegative ? "-" : ""}$${absoluteValue.toFixed(2)}`;
};

const SummaryRow = ({ label, amount, className = "", onRemove, hideAmount = false }) => (
	<div className={`flex justify-between items-center py-1 ${className}`}>
		<div className="flex items-center">
			<span className="text-sm text-muted-foreground">
				{label}
			</span>
			{onRemove && (
				<Button
					variant="ghost"
					size="icon"
					className="h-5 w-5 ml-2 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
					onClick={onRemove}
				>
					<X className="h-3 w-3" />
				</Button>
			)}
		</div>
		{!hideAmount && (
			<span className="text-sm font-semibold text-foreground">
				{safeFormatCurrency(amount)}
			</span>
		)}
	</div>
);

const CartSummary = () => {
	const {
		total,
		orderId,
		orderNumber,
		items,
		startTender,
		forceCancelAndStartPayment,
		subtotal,
		taxAmount,
		surchargesAmount,
		appliedDiscounts,
		adjustments,
		setIsDiscountDialogOpen,
		removeDiscountViaSocket,
		removeAdjustment,
		isOfflineOrder,
		diningPreference,
		customerFirstName,
	} = usePosStore(
		(state) => ({
			total: state.total,
			orderId: state.orderId,
			orderNumber: state.orderNumber,
			items: state.items,
			startTender: state.startTender,
			forceCancelAndStartPayment: state.forceCancelAndStartPayment,
			subtotal: state.subtotal,
			taxAmount: state.taxAmount,
			surchargesAmount: state.surchargesAmount,
			appliedDiscounts: state.appliedDiscounts,
			adjustments: state.adjustments,
			setIsDiscountDialogOpen: state.setIsDiscountDialogOpen,
			removeDiscountViaSocket: state.removeDiscountViaSocket,
			removeAdjustment: state.removeAdjustment,
			isOfflineOrder: state.isOfflineOrder,
			diningPreference: state.diningPreference,
			customerFirstName: state.customerFirstName,
		}),
		shallow
	);

	// Debug logging to see if component re-renders with updated adjustments
	console.log('🔄 CartSummary render - adjustments:', adjustments);

	// Get kitchen zones from cloud configuration (includes printer info)
	const { data: kitchenZones = [] } = useKitchenZones();

	const [isLoading, setIsLoading] = useState(false);
	const [isSendingToKitchen, setIsSendingToKitchen] = useState(false);

	const handleCharge = async () => {
		if (!orderId || items.length === 0) return;

		setIsLoading(true);
		try {
			// Check if this is an offline order or we're currently offline
			const isOffline = isOfflineOrder || cartGateway.isOfflineMode();

			if (isOffline) {
				// For offline orders, build a local order object from cart state
				// No API call needed - use local state
				const localOrderDetails = {
					id: orderId,
					order_number: orderNumber || `OFFLINE-${orderId.substring(6, 14)}`,
					items: items,
					subtotal: subtotal,
					tax_total: taxAmount,
					grand_total: total,
					total_discounts_amount: appliedDiscounts?.reduce(
						(sum, d) => sum + parseFloat(d.amount || 0),
						0
					) || 0,
					applied_discounts: appliedDiscounts || [],
					adjustments: adjustments || [],
					dining_preference: diningPreference,
					guest_first_name: customerFirstName,
					payment_details: {
						amount_paid: 0,
						transactions: [],
					},
					// Mark this as an offline order for payment handling
					_isOfflineOrder: true,
				};

				startTender(localOrderDetails);
			} else {
				// Online flow - fetch latest order details from server
				const { data: orderDetails } = await apiClient.get(`/orders/${orderId}/`);

				if (orderDetails.payment_in_progress) {
					toast({
						title: "Resolving a prior session...",
						description: "An incomplete payment was found and is being reset.",
					});
					await forceCancelAndStartPayment(orderId);
				} else {
					startTender(orderDetails);
				}
			}
		} catch (error) {
			console.error("Error during pre-flight payment check:", error);
			toast({
				title: "Error Starting Payment",
				description: "Could not verify order status. Please try again.",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
		}
	};

	const handleSendToKitchen = async () => {
		if (!orderId || items.length === 0) return;

		setIsSendingToKitchen(true);

		try {
			// Check if we're offline - use local cart state instead of API
			const isOffline = isOfflineOrder || cartGateway.isOfflineMode();

			let kitchenOrder;
			if (isOffline) {
				// Build order object from local cart state
				kitchenOrder = {
					id: orderId,
					order_number: orderNumber || `OFFLINE-${orderId.substring(6, 14)}`,
					items: items,
					status: "SENT_TO_KITCHEN",
					created_at: new Date().toISOString(),
					guest_first_name: customerFirstName,
					dining_preference: diningPreference,
				};
			} else {
				// Online - fetch latest order details from server
				const { data: orderDetails } = await apiClient.get(`/orders/${orderId}/`);
				kitchenOrder = {
					...orderDetails,
					id: orderDetails.id,
					order_number: orderDetails.order_number,
					items: orderDetails.items,
					status: "SENT_TO_KITCHEN",
					created_at: orderDetails.created_at,
					guest_first_name: orderDetails.guest_first_name,
					dining_preference: orderDetails.dining_preference,
				};
			}

			if (!kitchenZones || kitchenZones.length === 0) {
				toast({
					title: "No Kitchen Zones",
					description: "Please configure kitchen zones in settings first.",
					variant: "destructive",
				});
				return;
			}

			let ticketsPrinted = 0;
			const errors = [];

			for (const zone of kitchenZones) {
				try {
					if (!zone.printer) {
						console.warn(
							`No printer configured for zone "${zone.name}", skipping`
						);
						continue;
					}

					const filterConfig = {
						categories: zone.categories || zone.category_ids || [],
						productTypes: zone.productTypes || [],
					};

					if (!filterConfig.categories.length) {
						console.log(
							`Zone "${zone.name}" has no categories configured, skipping`
						);
						continue;
					}

					console.log(
						`Printing kitchen ticket for zone "${zone.name}" with filter:`,
						filterConfig
					);

					const result = await printKitchenTicket(
						zone.printer,
						kitchenOrder,
						zone.name,
						filterConfig
					);

					if (result.success) {
						if (result.message) {
							console.log(`Zone "${zone.name}": ${result.message}`);
						} else {
							console.log(
								`Kitchen ticket for zone "${zone.name}" printed successfully`
							);
						}
						ticketsPrinted++;
					} else {
						console.error(
							`Failed to print kitchen ticket for zone "${zone.name}":`,
							result.error
						);
						errors.push(`${zone.name}: ${result.error}`);
					}
				} catch (error) {
					console.error(
						`Error printing kitchen ticket for zone "${zone.name}":`,
						error
					);
					errors.push(`${zone.name}: ${error.message}`);
				}
			}

			if (ticketsPrinted > 0) {
				// Mark items as sent to kitchen in the backend (skip for offline orders)
				const isOffline = isOfflineOrder || cartGateway.isOfflineMode();
				if (!isOffline) {
					try {
						await markSentToKitchen(orderId);
					} catch (error) {
						console.error("Failed to mark items as sent to kitchen:", error);
					}
				}

				toast({
					title: "Order Sent to Kitchen",
					description: `${ticketsPrinted} kitchen ticket(s) printed successfully. Customer can continue shopping while food is prepared.`,
				});
			}

			if (errors.length > 0) {
				console.error("Kitchen printing errors:", errors);
				toast({
					title: "Some Kitchen Tickets Failed",
					description: `${ticketsPrinted} succeeded, ${errors.length} failed. Check printer connections.`,
					variant: "destructive",
				});
			}

			if (ticketsPrinted === 0) {
				toast({
					title: "No Kitchen Tickets Printed",
					description:
						"No items matched the configured kitchen zones or no printers are available.",
					variant: "destructive",
				});
			}
		} catch (error) {
			console.error("Error sending order to kitchen:", error);
			toast({
				title: "Failed to Send to Kitchen",
				description:
					error.response?.data?.detail || "An unexpected error occurred.",
				variant: "destructive",
			});
		} finally {
			setIsSendingToKitchen(false);
		}
	};

	const handleRemoveAdjustment = async (adjustmentId) => {
		if (!orderId) return;

		try {
			await removeAdjustment(adjustmentId);
			// Cart will update automatically via WebSocket or local state
		} catch (error) {
			console.error("Error removing adjustment:", error);
			toast({
				title: "Error",
				description: error.message || "Failed to remove adjustment. Please try again.",
				variant: "destructive",
			});
		}
	};

	const hasItems = items.length > 0;
	const hasDiscounts = appliedDiscounts && appliedDiscounts.length > 0;
	const hasAdjustments = adjustments && adjustments.length > 0;
	const hasKitchenZones = kitchenZones && kitchenZones.length > 0;

	// Check for ORDER-LEVEL exemptions only (item-level exemptions are already reflected in taxAmount)
	const taxExemption = adjustments?.find((adj) => adj.adjustment_type === "TAX_EXEMPT" && !adj.order_item);
	const feeExemption = adjustments?.find((adj) => adj.adjustment_type === "FEE_EXEMPT" && !adj.order_item);

	// Calculate effective subtotal (including item-level discounts in the item prices)
	const effectiveSubtotal = items.reduce((sum, item) => {
		// Find item-level one-off discounts for this item
		const itemDiscounts = adjustments?.filter(
			(adj) => adj.adjustment_type === "ONE_OFF_DISCOUNT" && adj.order_item === item.id
		) || [];

		// Calculate total item-level discount amount
		const totalItemDiscount = itemDiscounts.reduce((discSum, disc) => discSum + parseFloat(disc.amount || 0), 0);

		// Calculate effective price per unit (including discounts)
		const basePrice = parseFloat(item.price_at_sale);
		const effectivePricePerUnit = itemDiscounts.length > 0
			? basePrice + (totalItemDiscount / item.quantity)  // discount.amount is negative
			: basePrice;

		// Add this item's effective total to the sum
		return sum + (item.quantity * effectivePricePerUnit);
	}, 0);

	return (
		<div className="border-t border-border/60 bg-muted/20">
			<div className="p-4 space-y-4">
				{/* Summary Details */}
				<div className="space-y-2">
					<SummaryRow
						label="Subtotal"
						amount={effectiveSubtotal}
					/>
					{hasDiscounts && (
						<>
							{appliedDiscounts.map((appliedDiscount) => (
								<SummaryRow
									key={appliedDiscount.id}
									label={appliedDiscount.discount.name}
									amount={-appliedDiscount.amount}
									className="text-emerald-600 dark:text-emerald-400"
									onRemove={() =>
										removeDiscountViaSocket(appliedDiscount.discount.id)
									}
								/>
							))}
							{/* Show discounted subtotal for clarity */}
							<SummaryRow
								label="Discounted Subtotal"
								amount={
									effectiveSubtotal -
									(appliedDiscounts?.reduce(
										(sum, d) => sum + parseFloat(d.amount || 0),
										0
									) || 0)
								}
								className="border-t border-border/60 pt-2 font-medium text-foreground"
							/>
						</>
					)}
					{hasAdjustments && (
						<>
							{/* Show order-level one-off discounts only (item-level discounts show on items) */}
							{adjustments
								.filter((adj) => adj.adjustment_type === "ONE_OFF_DISCOUNT" && !adj.order_item)
								.map((adjustment) => {
									let label = "";
									if (adjustment.discount_type === "PERCENTAGE") {
										label = `${adjustment.discount_value}% Discount`;
									} else {
										label = `$${adjustment.discount_value} Discount`;
									}

									return (
										<SummaryRow
											key={adjustment.id}
											label={label}
											amount={adjustment.amount}
											className="text-emerald-600 dark:text-emerald-400"
											onRemove={() => handleRemoveAdjustment(adjustment.id)}
										/>
									);
								})}

							{/* Show discounted subtotal if there are order-level one-off discounts */}
							{adjustments.some((adj) => adj.adjustment_type === "ONE_OFF_DISCOUNT" && !adj.order_item) && (
								<SummaryRow
									label="Discounted Subtotal"
									amount={
										effectiveSubtotal +
										adjustments
											.filter((adj) => adj.adjustment_type === "ONE_OFF_DISCOUNT" && !adj.order_item)
											.reduce((sum, adj) => sum + parseFloat(adj.amount || 0), 0)
									}
									className="border-t border-border/60 pt-2 font-medium text-foreground"
								/>
							)}
						</>
					)}
					{/* Show either Taxes OR Tax Exemption (not both) */}
					{taxExemption ? (
						<SummaryRow
							label="Tax Exemption"
							amount={taxExemption.amount}
							className="text-orange-600 dark:text-orange-400"
							onRemove={() => handleRemoveAdjustment(taxExemption.id)}
							hideAmount={true}
						/>
					) : (
						<SummaryRow
							label="Taxes"
							amount={taxAmount}
						/>
					)}

					{/* Show Fee Exemption if applied (service fees are added during payment, not here) */}
					{feeExemption && (
						<SummaryRow
							label="Fee Exemption"
							amount={feeExemption.amount}
							className="text-blue-600 dark:text-blue-400"
							onRemove={() => handleRemoveAdjustment(feeExemption.id)}
							hideAmount={true}
						/>
					)}
				</div>

				{/* Total */}
				<div className="flex justify-between items-center pt-3 border-t border-border/60">
					<span className="text-lg font-bold text-foreground">
						Total
					</span>
					<span className="text-xl font-bold text-foreground">
						{safeFormatCurrency(total)}
					</span>
				</div>

				{/* Action Buttons */}
				<div
					className={`grid gap-3 pt-2 ${
						hasKitchenZones ? "grid-cols-3" : "grid-cols-2"
					}`}
				>
					{hasKitchenZones && (
						<Button
							variant="outline"
							className="h-12 border-border/60 hover:bg-muted/40 bg-transparent"
							disabled={!hasItems || isLoading || isSendingToKitchen}
							onClick={handleSendToKitchen}
						>
							{isSendingToKitchen ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Kitchen...
								</>
							) : (
								<>
									<ChefHat className="mr-2 h-4 w-4" />
									Kitchen
								</>
							)}
						</Button>
					)}

					<Button
						variant="outline"
						className="h-12 border-border/60 hover:bg-muted/40 bg-transparent"
						disabled={!hasItems || isLoading || isSendingToKitchen}
						onClick={() => setIsDiscountDialogOpen(true)}
					>
						<Tag className="mr-2 h-4 w-4" />
						Discounts
					</Button>

					<Button
						className={`h-12 font-semibold ${
							isOfflineOrder
								? "bg-orange-600 hover:bg-orange-700 text-white"
								: "bg-primary hover:bg-primary/90 text-primary-foreground"
						}`}
						disabled={!hasItems || isLoading || isSendingToKitchen}
						onClick={handleCharge}
					>
						{isLoading ? (
							<Loader2 className="mr-2 h-5 w-5 animate-spin" />
						) : isOfflineOrder ? (
							<WifiOff className="mr-2 h-5 w-5" />
						) : (
							<CreditCard className="mr-2 h-5 w-5" />
						)}
						{isOfflineOrder ? "Cash Only" : "Charge"}
					</Button>
				</div>

				{hasKitchenZones && (
					<p className="text-xs text-muted-foreground text-center mt-2">
						Print kitchen tickets while customer continues shopping
					</p>
				)}
			</div>
		</div>
	);
};

export default CartSummary;
