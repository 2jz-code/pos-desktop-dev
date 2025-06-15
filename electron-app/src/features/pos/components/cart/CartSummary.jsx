// desktop-combined/electron-app/src/features/pos/components/cart/CartSummary.jsx
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { usePosStore } from "@/store/posStore";
import { shallow } from "zustand/shallow";
import apiClient from "@/lib/apiClient";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Tag, X } from "lucide-react";

// Helper to format currency safely, defaulting to $0.00
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
	<div className={`flex justify-between items-center text-sm ${className}`}>
		<div className="flex items-center">
			<span className="text-muted-foreground">{label}</span>
			{onRemove && (
				<Button
					variant="ghost"
					size="icon"
					className="h-5 w-5 ml-1 text-red-500 hover:bg-red-100 hover:text-red-600"
					onClick={onRemove}
				>
					<X className="h-3 w-3" />
				</Button>
			)}
		</div>
		<span className="font-medium text-foreground">
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
		surchargesAmount,
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
			surchargesAmount: state.surchargesAmount,
			appliedDiscounts: state.appliedDiscounts,
			setIsDiscountDialogOpen: state.setIsDiscountDialogOpen,
			removeDiscountViaSocket: state.removeDiscountViaSocket,
		}),
		shallow
	);

	const [isLoading, setIsLoading] = useState(false);

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
				const orderForPayment = {
					id: orderId,
					grand_total: total,
					items: items,
				};

				// ======================= DEBUG 1 =======================
				console.log(
					`[DEBUG 1/5] CartSummary: Calling startTender with total: ${orderForPayment.grand_total}`
				);
				// =======================================================

				startTender(orderForPayment);
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

	const hasItems = items.length > 0;
	const hasDiscounts = appliedDiscounts && appliedDiscounts.length > 0;

	return (
		<div className="p-4 space-y-4">
			<div className="space-y-1 border-b pb-3">
				<SummaryRow
					label="Subtotal"
					amount={subtotal}
				/>
				{hasDiscounts &&
					appliedDiscounts.map((appliedDiscount) => (
						<SummaryRow
							key={appliedDiscount.id}
							// FIX: Changed 'description' to 'name' to match your data
							label={appliedDiscount.discount.name}
							amount={-appliedDiscount.amount}
							className="text-red-500"
							onRemove={() =>
								removeDiscountViaSocket(appliedDiscount.discount.id)
							}
						/>
					))}
				<SummaryRow
					label="Taxes"
					amount={taxAmount}
				/>
				<SummaryRow
					label="Surcharges"
					amount={surchargesAmount}
				/>
			</div>
			<div className="flex justify-between font-bold text-2xl pt-2">
				<span>Total</span>
				<span>{safeFormatCurrency(total)}</span>
			</div>
			<div className="grid grid-cols-2 gap-2 pt-2">
				<Button
					variant="outline"
					className="h-14"
					disabled={!hasItems || isLoading}
					onClick={() => setIsDiscountDialogOpen(true)}
				>
					<Tag className="mr-2 h-5 w-5" />
					Discounts
				</Button>
				<Button
					className="h-14 text-lg"
					disabled={!hasItems || isLoading}
					onClick={handleCharge}
				>
					{isLoading ? (
						<Loader2 className="mr-2 h-6 w-6 animate-spin" />
					) : (
						`Charge`
					)}
				</Button>
			</div>
		</div>
	);
};

export default CartSummary;
