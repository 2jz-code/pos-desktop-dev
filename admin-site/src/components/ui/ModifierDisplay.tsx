import React from "react";
import { formatCurrency } from "@ajeen/ui";

interface Modifier {
	modifier_set_name: string;
	option_name: string;
	price_at_sale: number;
	quantity: number;
}

interface ModifierDisplayProps {
	modifiers: Modifier[];
	compact?: boolean;
	showTotal?: boolean;
}

const ModifierDisplay: React.FC<ModifierDisplayProps> = ({ 
	modifiers, 
	compact = false, 
	showTotal = false 
}) => {
	if (!modifiers || modifiers.length === 0) {
		return null;
	}

	// Calculate total modifier price
	const totalModifierPrice = modifiers.reduce(
		(sum, modifier) => sum + (parseFloat(modifier.price_at_sale.toString()) * modifier.quantity),
		0
	);


	if (compact) {
		// Compact display for lists - show as a summary line
		const freeModifiers = modifiers.filter(m => parseFloat(m.price_at_sale.toString()) === 0);
		const chargedModifiers = modifiers.filter(m => parseFloat(m.price_at_sale.toString()) > 0);

		return (
			<div className="mt-1 space-y-0.5">
				{/* Show free modifiers - each on its own line */}
				{freeModifiers.map((modifier, index) => (
					<p key={index} className="text-xs text-muted-foreground">
						{modifier.modifier_set_name}: {modifier.option_name}
						{modifier.quantity > 1 && ` (x${modifier.quantity})`}
					</p>
				))}
				
				{/* Show charged modifiers - each on its own line with price */}
				{chargedModifiers.map((modifier, index) => (
					<div key={index} className="flex justify-between items-center text-xs">
						<span className="text-muted-foreground">
							{modifier.modifier_set_name}: {modifier.option_name}
							{modifier.quantity > 1 && ` (x${modifier.quantity})`}
						</span>
						<span className="text-emerald-600 dark:text-emerald-400 font-medium">
							+{formatCurrency(parseFloat(modifier.price_at_sale.toString()) * modifier.quantity)}
						</span>
					</div>
				))}
			</div>
		);
	}

	// Full display for order details
	return (
		<div className="space-y-2 ml-4 mt-2">
			{modifiers.map((modifier, index) => (
				<div
					key={index}
					className="flex justify-between items-center text-sm"
				>
					<span className="text-muted-foreground flex items-center">
						<span className="text-muted-foreground/60 mr-2">•</span>
						{modifier.modifier_set_name}: {modifier.option_name}
						{modifier.quantity > 1 && ` x${modifier.quantity}`}
					</span>
					{parseFloat(modifier.price_at_sale.toString()) > 0 && (
						<span className="text-emerald-600 dark:text-emerald-400 font-medium">
							+{formatCurrency(parseFloat(modifier.price_at_sale.toString()) * modifier.quantity)}
						</span>
					)}
				</div>
			))}
			{showTotal && totalModifierPrice > 0 && (
				<div className="border-t border-border pt-2 mt-2">
					<div className="flex justify-between items-center text-sm font-medium">
						<span className="text-foreground">Total modifiers:</span>
						<span className="text-emerald-600 dark:text-emerald-400">
							+{formatCurrency(totalModifierPrice)}
						</span>
					</div>
				</div>
			)}
		</div>
	);
};

export default ModifierDisplay;