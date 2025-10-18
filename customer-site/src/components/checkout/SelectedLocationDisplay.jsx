/**
 * SelectedLocationDisplay Component
 *
 * Compact display of selected location for checkout summary/header.
 * Shows location name and address in a condensed format.
 */

import React from "react";
import { Store, MapPin } from "lucide-react";
import { useLocationSelector } from "@/hooks/useLocationSelector";

const SelectedLocationDisplay = ({ className = "", showIcon = true, compact = false }) => {
	const {
		selectedLocation,
		isLoading,
		formatAddress,
	} = useLocationSelector();

	if (isLoading) {
		return (
			<div className={`animate-pulse ${className}`}>
				<div className="h-4 bg-accent-subtle-gray/30 rounded w-32"></div>
			</div>
		);
	}

	if (!selectedLocation) {
		return null;
	}

	if (compact) {
		return (
			<div className={`flex items-center text-sm text-accent-dark-brown ${className}`}>
				{showIcon && <Store className="h-4 w-4 mr-1.5 text-primary-green flex-shrink-0" />}
				<span className="font-medium">{selectedLocation.name}</span>
			</div>
		);
	}

	return (
		<div className={`${className}`}>
			<div className="flex items-center text-sm">
				{showIcon && <Store className="h-4 w-4 mr-1.5 text-primary-green flex-shrink-0" />}
				<span className="font-medium text-accent-dark-green">
					{selectedLocation.name}
				</span>
			</div>
			{formatAddress(selectedLocation) && (
				<div className="flex items-start text-xs text-accent-dark-brown mt-1">
					{showIcon && <MapPin className="h-3 w-3 mr-1.5 mt-0.5 flex-shrink-0 text-accent-subtle-gray" />}
					<span className={showIcon ? "" : "ml-5.5"}>
						{formatAddress(selectedLocation)}
					</span>
				</div>
			)}
		</div>
	);
};

export default SelectedLocationDisplay;
