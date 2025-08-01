import React from "react";

const ModifierDisplay = ({ modifiers, compact = false, showTotal = false }) => {
	if (!modifiers || modifiers.length === 0) {
		return null;
	}

	// Calculate total modifier price
	const totalModifierPrice = modifiers.reduce(
		(sum, modifier) => sum + (parseFloat(modifier.price_at_sale) * modifier.quantity),
		0
	);

	if (compact) {
		// Compact display for cart sidebar - show as a summary line
		const hasChargedModifiers = totalModifierPrice > 0;
		const freeModifiers = modifiers.filter(m => parseFloat(m.price_at_sale) === 0);
		const chargedModifiers = modifiers.filter(m => parseFloat(m.price_at_sale) > 0);

		return (
			<div className="mt-1 space-y-0.5">
				{/* Show free modifiers - each on its own line */}
				{freeModifiers.map((modifier, index) => (
					<p key={index} className="text-xs text-accent-dark-brown">
						{modifier.modifier_set_name} - {modifier.option_name}
						{modifier.quantity > 1 && ` (x${modifier.quantity})`}
					</p>
				))}
				
				{/* Show charged modifiers - each on its own line with price */}
				{chargedModifiers.map((modifier, index) => (
					<div key={index} className="flex justify-between items-center text-xs">
						<span className="text-accent-dark-brown">
							{modifier.modifier_set_name} - {modifier.option_name}
							{modifier.quantity > 1 && ` (x${modifier.quantity})`}
						</span>
						<span className="text-primary-green font-medium">
							+${(parseFloat(modifier.price_at_sale) * modifier.quantity).toFixed(2)}
						</span>
					</div>
				))}
			</div>
		);
	}

	// Full display for product details/checkout
	return (
		<div className="space-y-1">
			{modifiers.map((modifier, index) => (
				<div
					key={index}
					className="flex justify-between items-center text-sm"
				>
					<span className="text-accent-dark-brown">
						{modifier.modifier_set_name}: {modifier.option_name}
						{modifier.quantity > 1 && ` x${modifier.quantity}`}
					</span>
					{parseFloat(modifier.price_at_sale) > 0 && (
						<span className="text-primary-green font-medium">
							+${parseFloat(modifier.price_at_sale).toFixed(2)}
						</span>
					)}
				</div>
			))}
		</div>
	);
};

export default ModifierDisplay;