import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import ModifierDisplay from "@/components/ui/ModifierDisplay";
import {
	useFinancialSettings,
	formatTaxRate,
	formatSurchargeRate,
} from "@/hooks/useSettings";

const OrderSummary = ({ cart, isLoading, surchargeDisplay, tip = 0 }) => {
	// Fetch financial settings for display purposes
	const { data: financialSettings } = useFinancialSettings();

	if (!cart) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-accent-dark-green">
						Order Summary
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex justify-center items-center h-32">
						<div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-green"></div>
					</div>
				</CardContent>
			</Card>
		);
	}

	const formatPrice = (price) => {
		const numericPrice =
			typeof price === "string" ? parseFloat(price) : Number(price);
		return isNaN(numericPrice) ? "0.00" : numericPrice.toFixed(2);
	};

	// Use backend-calculated values directly from cart.totals - no frontend calculations
	const subtotal = parseFloat(cart.totals?.subtotal || 0);
	const taxAmount = parseFloat(cart.totals?.tax_total || 0);
	const discountAmount = parseFloat(cart.totals?.discount_total || 0);
	const total = parseFloat(cart.totals?.grand_total || 0);

	// Calculate total with frontend tip
	const totalWithTip = total + tip;

	// Get tax rate for display (from cart's store_location_tax_rate)
	const taxRateDisplay = cart.store_location_tax_rate != null
		? formatTaxRate(cart.store_location_tax_rate)
		: "0%";

	// Get surcharge rate for display (from global settings)
	const surchargeRateDisplay = financialSettings?.surcharge_percentage
		? formatSurchargeRate(financialSettings.surcharge_percentage)
		: "3.5%";

	return (
		<Card className="border-accent-subtle-gray/30">
			<CardHeader>
				<CardTitle className="text-accent-dark-green">Order Summary</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Cart Items */}
				<div className="space-y-3">
					{cart.items.map((item) => (
						<div
							key={item.id}
							className="flex justify-between items-start"
						>
							<div className="flex-1">
								<h4 className="text-sm font-medium text-accent-dark-brown">
									{item.product.name}
								</h4>
								
								{/* Display modifiers */}
								<ModifierDisplay 
									modifiers={item.selected_modifiers_snapshot} 
									compact={false} 
								/>
								
								{item.notes && (
									<p className="text-xs text-accent-dark-brown/60 mt-1">
										Note: {item.notes}
									</p>
								)}
								<p className="text-xs text-accent-dark-brown/70 mt-1">
									Qty: {item.quantity}
								</p>
							</div>
							<div className="text-sm font-medium text-accent-dark-brown ml-3">
								$
								{formatPrice(
									parseFloat(item.price_at_sale || item.product.price || 0) *
										item.quantity
								)}
							</div>
						</div>
					))}
				</div>

				<Separator className="bg-accent-subtle-gray/30" />

				{/* Order Totals */}
				<div className="space-y-2 text-sm">
					<div className="flex justify-between">
						<span className="text-accent-dark-brown/70">Subtotal</span>
						<span className="text-accent-dark-brown">
							${formatPrice(subtotal)}
						</span>
					</div>

					{taxAmount > 0 && (
						<div className="flex justify-between">
							<span className="text-accent-dark-brown/70">
								Tax ({taxRateDisplay})
							</span>
							<span className="text-accent-dark-brown">
								${formatPrice(taxAmount)}
							</span>
						</div>
					)}

					{/* Service Fee - only shown if surchargeDisplay is available (calculated via payment API) */}
					{surchargeDisplay?.amount > 0 && (
						<div className="flex justify-between">
							<span className="text-accent-dark-brown/70">
								Service Fee ({surchargeRateDisplay})
							</span>
							<span className="text-accent-dark-brown">
								${formatPrice(surchargeDisplay.amount)}
							</span>
						</div>
					)}

					{tip > 0 && (
						<div className="flex justify-between">
							<span className="text-accent-dark-brown/70">
								Tip
							</span>
							<span className="text-accent-dark-brown">
								${formatPrice(tip)}
							</span>
						</div>
					)}

					<Separator className="bg-accent-subtle-gray/30" />

					<div className="flex justify-between font-semibold text-base">
						<span className="text-accent-dark-green">Total</span>
						<span className="text-accent-dark-green">
							${formatPrice(
								surchargeDisplay 
									? surchargeDisplay.totalWithSurcharge + tip
									: totalWithTip
							)}
						</span>
					</div>
				</div>

				{/* Loading Overlay */}
				{isLoading && (
					<div className="absolute inset-0 bg-accent-light-beige/50 rounded-lg flex items-center justify-center">
						<div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary-green"></div>
					</div>
				)}
			</CardContent>
		</Card>
	);
};

export default OrderSummary;
