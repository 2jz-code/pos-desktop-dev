import React from "react";
import { Button } from "@/shared/components/ui/button";
import { getEnabledPlatforms } from "@/domains/pos/constants/deliveryPlatforms";

/**
 * DeliveryPaymentView - Platform selection for delivery orders
 * Shows available delivery platforms (DoorDash, Uber Eats) for manual order entry
 */
const DeliveryPaymentView = ({ onSelectPlatform }) => {
	const enabledPlatforms = getEnabledPlatforms();

	const handlePlatformSelect = (platform) => {
		if (onSelectPlatform) {
			onSelectPlatform(platform.id);
		}
	};

	return (
		<div className="flex flex-col space-y-4 p-4">
			<div className="text-center mb-4">
				<h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
					Select Delivery Platform
				</h3>
				<p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
					Choose the delivery service for this order
				</p>
			</div>

			<div className="space-y-3">
				{enabledPlatforms.map((platform) => {
					const IconComponent = platform.icon;
					
					return (
						<Button
							key={platform.id}
							variant="outline"
							className="w-full py-6 text-lg flex items-center justify-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800"
							onClick={() => handlePlatformSelect(platform)}
							style={{
								borderColor: platform.color + "20",
								"--hover-bg": platform.color + "10"
							}}
						>
							<IconComponent 
								className="h-6 w-6" 
								style={{ color: platform.color }}
							/>
							<span className="font-medium">{platform.displayName}</span>
						</Button>
					);
				})}
			</div>

			<div className="mt-6 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
				<p className="text-xs text-slate-600 dark:text-slate-400 text-center">
					This will mark the order as paid and completed for manual entry of delivery platform orders.
				</p>
			</div>
		</div>
	);
};

export default DeliveryPaymentView;