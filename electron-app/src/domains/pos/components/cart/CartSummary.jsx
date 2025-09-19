"use client";

import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { usePosStore } from "@/domains/pos/store/posStore";
import { shallow } from "zustand/shallow";
import apiClient from "@/shared/lib/apiClient";
import { toast } from "@/shared/components/ui/use-toast";
import { Loader2, Tag, X, ChefHat, CreditCard } from "lucide-react";
import { printKitchenTicket } from "@/shared/lib/hardware/printerService";
import { useKitchenZones } from "@/domains/settings/hooks/useKitchenZones";
import { markSentToKitchen } from "@/domains/orders/services/orderService";

const safeFormatCurrency = (value) => {
	const number = Number(value);
	if (isNaN(number)) {
		return "$0.00";
	}
	const isNegative = number < 0;
	const absoluteValue = Math.abs(number);
	return `${isNegative ? "-" : ""}$${absoluteValue.toFixed(2)}`;
};

const SummaryRow = ({ label, amount, className = "", onRemove }) => (
	<div className={`flex justify-between items-center py-1 ${className}`}>
		<div className="flex items-center">
			<span className="text-sm text-slate-600 dark:text-slate-400">
				{label}
			</span>
			{onRemove && (
				<Button
					variant="ghost"
					size="icon"
					className="h-5 w-5 ml-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
					onClick={onRemove}
				>
					<X className="h-3 w-3" />
				</Button>
			)}
		</div>
		<span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
			{safeFormatCurrency(amount)}
		</span>
	</div>
);

const CartSummary = () => {
	const {
		total,
		orderId,
		items,
		startTender,
		forceCancelAndStartPayment,
		subtotal,
		taxAmount,
		appliedDiscounts,
		setIsDiscountDialogOpen,
		removeDiscountViaSocket,
	} = usePosStore(
		(state) => ({
			total: state.total,
			orderId: state.orderId,
			items: state.items,
			startTender: state.startTender,
			forceCancelAndStartPayment: state.forceCancelAndStartPayment,
			subtotal: state.subtotal,
			taxAmount: state.taxAmount,
			appliedDiscounts: state.appliedDiscounts,
			setIsDiscountDialogOpen: state.setIsDiscountDialogOpen,
			removeDiscountViaSocket: state.removeDiscountViaSocket,
		}),
		shallow
	);

	// Get kitchen zones from cloud configuration (includes printer info)
	const { data: kitchenZones = [] } = useKitchenZones();

	const [isLoading, setIsLoading] = useState(false);
	// Removed isSendingToKitchen state - kitchen operations are now background/parallel

	const handleCharge = async () => {
		if (!orderId || items.length === 0) return;

		setIsLoading(true);
		try {
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

		// No loading state - operations run in background for instant UX

		try {
			const { data: orderDetails } = await apiClient.get(`/orders/${orderId}/`);

			const kitchenOrder = {
				...orderDetails,
				id: orderDetails.id,
				order_number: orderDetails.order_number,
				items: orderDetails.items,
				status: "SENT_TO_KITCHEN",
				created_at: orderDetails.created_at,
				guest_first_name: orderDetails.guest_first_name,
				dining_preference: orderDetails.dining_preference,
			};

			if (!kitchenZones || kitchenZones.length === 0) {
				toast({
					title: "No Kitchen Zones",
					description: "Please configure kitchen zones in settings first.",
					variant: "destructive",
				});
				return;
			}

			// Create printer operations for all zones
			const printerOperations = kitchenZones
				.filter(zone => {
					if (!zone.printer) {
						console.warn(`No printer configured for zone "${zone.name}", skipping`);
						return false;
					}
					const filterConfig = {
						categories: zone.categories || zone.category_ids || [],
						productTypes: zone.productTypes || [],
					};
					if (!filterConfig.categories.length) {
						console.log(`Zone "${zone.name}" has no categories configured, skipping`);
						return false;
					}
					return true;
				})
				.map(zone => {
					const filterConfig = {
						categories: zone.categories || zone.category_ids || [],
						productTypes: zone.productTypes || [],
					};

					console.log(`Preparing to print kitchen ticket for zone "${zone.name}" with filter:`, filterConfig);

					return printKitchenTicket(zone.printer, kitchenOrder, zone.name, filterConfig)
						.then(result => ({ zone: zone.name, result }))
						.catch(error => ({ zone: zone.name, error }));
				});

			// Run backend API and printer operations in parallel
			const [backendResult, ...printerResults] = await Promise.allSettled([
				// Backend API call (fast, critical)
				markSentToKitchen(orderId),
				// All printer operations (slow, non-critical)
				...printerOperations
			]);

			// Handle backend result first (critical)
			if (backendResult.status === 'rejected') {
				console.error("Failed to mark items as sent to kitchen:", backendResult.reason);
				toast({
					title: "Backend Error",
					description: "Failed to send order to kitchen system. Please try again.",
					variant: "destructive",
				});
				return; // Exit early if backend fails
			}

			console.log("✅ markSentToKitchen API call successful (parallel execution)");

			// Process printer results (non-critical)
			let ticketsPrinted = 0;
			const errors = [];

			printerResults.forEach((settledResult, index) => {
				if (settledResult.status === 'fulfilled' && settledResult.value) {
					const { zone, result, error } = settledResult.value;

					if (error) {
						console.error(`Error printing kitchen ticket for zone "${zone}":`, error);
						errors.push(`${zone}: ${error.message}`);
					} else if (result && result.success) {
						if (result.message) {
							console.log(`Zone "${zone}": ${result.message}`);
						} else {
							console.log(`Kitchen ticket for zone "${zone}" printed successfully`);
						}
						ticketsPrinted++;
					} else {
						console.error(`Failed to print kitchen ticket for zone "${zone}":`, result?.error);
						errors.push(`${zone}: ${result?.error || 'Unknown error'}`);
					}
				} else {
					console.error('Printer operation failed:', settledResult.reason);
					errors.push(`Unknown zone: ${settledResult.reason?.message || 'Unknown error'}`);
				}
			});

			if (ticketsPrinted > 0) {
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
					title: "Order Sent to Kitchen (Digital Only)",
					description:
						"Order sent to kitchen system successfully. Physical tickets failed to print - check printer connections.",
					variant: "warning",
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
		}
		// No finally block needed - no loading state to reset
	};

	const hasItems = items.length > 0;
	const hasDiscounts = appliedDiscounts && appliedDiscounts.length > 0;
	const hasKitchenZones = kitchenZones && kitchenZones.length > 0;

	return (
		<div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
			<div className="p-4 space-y-4">
				{/* Summary Details */}
				<div className="space-y-2">
					<SummaryRow
						label="Subtotal"
						amount={subtotal}
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
									subtotal -
									(appliedDiscounts?.reduce(
										(sum, d) => sum + parseFloat(d.amount || 0),
										0
									) || 0)
								}
								className="border-t border-slate-200 dark:border-slate-700 pt-2 font-medium text-slate-700 dark:text-slate-300"
							/>
						</>
					)}
					<SummaryRow
						label="Taxes"
						amount={taxAmount}
					/>
				</div>

				{/* Total */}
				<div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-slate-700">
					<span className="text-lg font-bold text-slate-900 dark:text-slate-100">
						Total
					</span>
					<span className="text-xl font-bold text-slate-900 dark:text-slate-100">
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
							className="h-12 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 bg-transparent"
							disabled={!hasItems || isLoading}
							onClick={handleSendToKitchen}
						>
							<ChefHat className="mr-2 h-4 w-4" />
							Kitchen
						</Button>
					)}

					<Button
						variant="outline"
						className="h-12 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 bg-transparent"
						disabled={!hasItems || isLoading}
						onClick={() => setIsDiscountDialogOpen(true)}
					>
						<Tag className="mr-2 h-4 w-4" />
						Discounts
					</Button>

					<Button
						className="h-12 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-900 font-semibold"
						disabled={!hasItems || isLoading}
						onClick={handleCharge}
					>
						{isLoading ? (
							<Loader2 className="mr-2 h-5 w-5 animate-spin" />
						) : (
							<CreditCard className="mr-2 h-5 w-5" />
						)}
						Charge
					</Button>
				</div>

				{hasKitchenZones && (
					<p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-2">
						Print kitchen tickets while customer continues shopping
					</p>
				)}
			</div>
		</div>
	);
};

export default CartSummary;
